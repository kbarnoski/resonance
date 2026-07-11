"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeThetaAudio, type ThetaAudio } from "./audio";
import { makeFieldRig, type FieldRig } from "./field";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 1136 · Theta Engine — a drug-free psychedelic field organised by the visual
// cortex's own TEMPORAL rhythm rather than by spatial geometry.
//
// A ~5 Hz theta oscillator whose phase gates ~40 Hz gamma bursts (theta–gamma
// phase-amplitude coupling). You HEAR the real nested rhythm; you SEE it as a
// log-polar form-constant field that re-blooms each theta cycle with a fine
// "gamma sparkle" whose amplitude rides the theta phase. Drag to steer:
//   X → coupling depth (how hard theta gates gamma)   Y → theta rate (3–6.5 Hz).
//
// SAFETY: the literal 5/40 Hz coupling is AUDIO-only. All visual luminance goes
// through the shared SafeFlicker engine (≤8 Hz cap, ≤3 Hz soft drift, never
// blacks out). "Gamma" is a spatial sparkle, never a full-screen strobe.
// ════════════════════════════════════════════════════════════════════════════

const NORMAL_MAX_VIS_HZ = 3;
const DEEP_MAX_VIS_HZ = 6;

export default function ThetaEnginePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meterRef = useRef<HTMLCanvasElement | null>(null);

  const audioRef = useRef<ThetaAudio | null>(null);
  const rigRef = useRef<FieldRig | null>(null);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 8, defaultHz: 2.2, floor: 0.6 }),
  );
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const bloomPhaseRef = useRef(0);
  const lastInteractRef = useRef(0);
  const reducedRef = useRef(false);
  const sparkClockRef = useRef(0);
  const waveRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(1024));

  // live control targets (eased toward)
  const couplingRef = useRef(0.5);
  const thetaRateRef = useRef(5);
  const deepRef = useRef(false);
  const pointerDownRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [deep, setDeep] = useState(false);
  // display values
  const [coupling, setCoupling] = useState(0.5);
  const [thetaRate, setThetaRate] = useState(5);

  const drawMeter = useCallback((energy: number) => {
    const cv = meterRef.current;
    const audio = audioRef.current;
    if (!cv || !audio) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const w = cv.width;
    const h = cv.height;
    ctx2d.clearRect(0, 0, w, h);
    // envelope waveform — you can SEE the nested theta/gamma rhythm
    const wave = waveRef.current;
    audio.fillWaveform(wave);
    ctx2d.lineWidth = 1.5;
    ctx2d.strokeStyle = `rgba(150,210,255,0.85)`;
    ctx2d.beginPath();
    const n = wave.length;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h * 0.5 - wave[i] * h * 0.42;
      if (i === 0) ctx2d.moveTo(x, y);
      else ctx2d.lineTo(x, y);
    }
    ctx2d.stroke();
    // level bar
    ctx2d.fillStyle = `rgba(180,120,255,0.9)`;
    ctx2d.fillRect(0, h - 3, w * Math.min(1, energy), 3);
  }, []);

  const loop = useCallback(() => {
    const now = performance.now();
    const tSec = (now - startTimeRef.current) / 1000;
    const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
    lastFrameRef.current = now;

    const audio = audioRef.current;
    const rig = rigRef.current;
    const flicker = flickerRef.current;

    // ── idle auto-modulation: never blank / never silent ──
    const idle = now - lastInteractRef.current > 4000;
    if (idle && !pointerDownRef.current) {
      couplingRef.current = 0.55 + 0.35 * Math.sin(tSec * 0.11);
      thetaRateRef.current = 4.8 + 1.3 * Math.sin(tSec * 0.07);
    }

    // push eased control values to audio
    if (audio) {
      audio.setCoupling(couplingRef.current);
      audio.setThetaRate(thetaRateRef.current);
    }

    // visual theta rate is a SLOWED, safe proxy of the audio theta (safety).
    const capHz = deepRef.current ? DEEP_MAX_VIS_HZ : NORMAL_MAX_VIS_HZ;
    const visHz = Math.max(0.5, Math.min(capHz, thetaRateRef.current * 0.42));
    flicker.setHz(visHz);

    // spatial reorganisation sawtooth at the same visual-theta cadence
    bloomPhaseRef.current = (bloomPhaseRef.current + dt * visHz) % 1;

    // sparkle clock — frozen slow under reduced motion, else a spatial "gamma" grain
    sparkClockRef.current += dt * (reducedRef.current ? 2.5 : 16);

    const energy = audio ? audio.energy() : 0.2;
    const thetaEnv = flicker.value(tSec); // [floor,1] soft luminance envelope

    if (rig) {
      rig.render({
        time: tSec,
        thetaEnv,
        bloomPhase: bloomPhaseRef.current,
        coupling: couplingRef.current,
        energy,
        deep: deepRef.current,
        sparkT: sparkClockRef.current,
      });
    }

    drawMeter(energy);
    rafRef.current = requestAnimationFrame(loop);
  }, [drawMeter]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const rig = rigRef.current;
    if (!canvas || !rig) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    rig.resize(
      Math.floor(window.innerWidth * dpr),
      Math.floor(window.innerHeight * dpr),
    );
  }, []);

  const handleStart = useCallback(async () => {
    if (started) return;

    reducedRef.current = prefersReducedMotion();
    flickerRef.current.enable(); // opt-in the soft luminance drift

    // audio (inside the gesture)
    const audio = makeThetaAudio();
    if (!audio) {
      setAudioFailed(true);
    } else {
      audioRef.current = audio;
      await audio.resume();
      audio.setCoupling(couplingRef.current);
      audio.setThetaRate(thetaRateRef.current);
    }

    // visuals
    const canvas = canvasRef.current;
    if (canvas) {
      const rig = makeFieldRig(canvas);
      if (rig) {
        rigRef.current = rig;
        const dpr = Math.min(1.6, window.devicePixelRatio || 1);
        rig.resize(
          Math.floor(window.innerWidth * dpr),
          Math.floor(window.innerHeight * dpr),
        );
      } else {
        setWebglFailed(true);
      }
    }

    startTimeRef.current = performance.now();
    lastFrameRef.current = performance.now();
    lastInteractRef.current = performance.now();
    setStarted(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [started, loop]);

  const handleStop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    flickerRef.current.kill();
    audioRef.current?.dispose();
    rigRef.current?.dispose();
    audioRef.current = null;
    rigRef.current = null;
    setStarted(false);
  }, []);

  // ── deep-coupling toggle ──
  const toggleDeep = useCallback(() => {
    const next = !deepRef.current;
    deepRef.current = next;
    setDeep(next);
    audioRef.current?.setDeep(next);
  }, []);

  // ── pointer drag → live control (X coupling, Y theta rate) ──
  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const x = Math.max(0, Math.min(1, clientX / window.innerWidth));
    const y = Math.max(0, Math.min(1, clientY / window.innerHeight));
    const c = x; // left→0, right→1
    const rate = 6.5 - y * (6.5 - 3); // top→6.5 Hz, bottom→3 Hz
    couplingRef.current = c;
    thetaRateRef.current = rate;
    setCoupling(c);
    setThetaRate(rate);
    lastInteractRef.current = performance.now();
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointerDownRef.current = true;
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerDownRef.current) return;
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const endDrag = useCallback(() => {
    pointerDownRef.current = false;
    lastInteractRef.current = performance.now();
  }, []);

  // keep display value refs synced when idle auto-mod runs
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      if (!pointerDownRef.current) {
        setCoupling(couplingRef.current);
        setThetaRate(thetaRateRef.current);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [started]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  useEffect(() => {
    const flicker = flickerRef.current;
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      flicker.kill();
      audioRef.current?.dispose();
      rigRef.current?.dispose();
      audioRef.current = null;
      rigRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04040a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      />

      {/* Title + description */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 max-w-xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-3xl">
          Theta Engine
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
          A psychedelic field organised not by spatial geometry but by the
          cortex&rsquo;s own <span className="text-violet-300">temporal</span>{" "}
          rhythm: a ~5&nbsp;Hz <span className="text-violet-300">theta</span>{" "}
          oscillation whose phase gates ~40&nbsp;Hz{" "}
          <span className="text-violet-300">gamma</span> bursts. Hear the nested
          rhythm; watch it re-bloom the field each cycle.
        </p>
        {started && (
          <p className="mt-3 text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            Drag anywhere &middot; left&ndash;right ={" "}
            <span className="text-violet-300">coupling depth</span> &middot;
            up&ndash;down = <span className="text-violet-300">theta rate</span>.
          </p>
        )}
      </div>

      {/* Live readouts + audio meter */}
      {started && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
          <div className="rounded-lg border border-border bg-black/55 px-3 py-2 text-right font-mono text-base text-foreground backdrop-blur-sm">
            <div>
              coupling{" "}
              <span className="text-violet-300">
                {(coupling * 100).toFixed(0)}%
              </span>
            </div>
            <div>
              theta{" "}
              <span className="text-violet-300">{thetaRate.toFixed(2)} Hz</span>
            </div>
            <div className="text-muted-foreground">gamma 40 Hz (audio)</div>
          </div>
          <canvas
            ref={meterRef}
            width={220}
            height={56}
            className="rounded-lg border border-border bg-black/55 backdrop-blur-sm"
          />
        </div>
      )}

      {/* Deep-coupling + Stop controls */}
      {started && (
        <div className="absolute bottom-4 left-4 z-30 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={toggleDeep}
            className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-base font-medium backdrop-blur-sm transition ${
              deep
                ? "border-violet-300/60 bg-violet-400/25 text-foreground"
                : "border-border bg-black/50 text-foreground hover:bg-black/70"
            }`}
          >
            {deep ? "Deep coupling: ON" : "Deep coupling"}
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="min-h-[44px] rounded-lg border border-violet-300/45 bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-200 backdrop-blur-sm transition hover:bg-violet-500/25"
          >
            Stop
          </button>
          {deep && (
            <p className="max-w-xs text-base text-violet-300/95 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
              Deep mode sharpens the bursts and raises the visual drift (still a
              soft ≤6&nbsp;Hz drift, never a strobe).
            </p>
          )}
        </div>
      )}

      {/* Fallback notices */}
      {audioFailed && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-[min(90vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-violet-400/40 bg-black/70 p-5 text-center">
          <p className="text-base text-violet-300">
            Web Audio is unavailable on this device, so the theta&ndash;gamma
            engine can&rsquo;t sound &mdash; the visual field still breathes.
          </p>
        </div>
      )}
      {webglFailed && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-[min(90vw,30rem)] -translate-x-1/2 rounded-xl border border-violet-400/40 bg-black/70 p-4 text-center">
          <p className="text-base text-violet-300">
            WebGL2 is unavailable here, so the shader field can&rsquo;t draw
            &mdash; but the theta&ndash;gamma audio still plays. Drag to steer
            it.
          </p>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#04040a]/85 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-full border border-violet-300/45 bg-violet-400/15 px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400/25"
          >
            Start the theta engine
          </button>
          <p className="mt-4 max-w-sm px-6 text-center text-base text-muted-foreground">
            Headphones recommended &mdash; the ~5&nbsp;Hz / 40&nbsp;Hz nesting
            lives in the sound. Visuals stay a soft, safe drift. Sound begins on
            tap.
          </p>
        </div>
      )}

      {/* Design notes */}
      <div className="absolute bottom-14 right-4 z-30 max-w-sm">
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-lg border border-border bg-black/50 px-4 py-2.5 text-base font-medium text-foreground backdrop-blur-sm transition hover:bg-black/70"
        >
          {showNotes ? "Hide design notes" : "Design notes"}
        </button>
        {showNotes && (
          <div className="mt-2 rounded-xl border border-border bg-black/80 p-4 text-base leading-relaxed text-muted-foreground backdrop-blur-md">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-2">
              The real coupling is in the{" "}
              <span className="text-foreground">audio</span>: a ~5&nbsp;Hz theta
              sine amplitude-modulates a mid carrier, and a 40&nbsp;Hz gamma
              oscillator is run through a VCA whose gain is a{" "}
              <em>sharpened function of the theta phase</em> &mdash; so gamma
              fires in bursts nested at each theta peak (phase-amplitude
              coupling). A sub drone and detuned partials give body; a limiter
              guards the peaks.
            </p>
            <p className="mt-2">
              The <span className="text-foreground">visual</span> is a raw WebGL2
              form-constant field (log-polar / Bressloff&ndash;Cowan) that
              re-blooms each theta cycle, with a fine &ldquo;gamma sparkle&rdquo;
              whose <em>amplitude</em> rides the theta phase. All luminance runs
              through <span className="text-foreground">SafeFlicker</span> &mdash;
              a soft ≤8&nbsp;Hz drift that never blacks out &mdash; so the
              seizure-risk 5/40&nbsp;Hz flicker never reaches the screen.
            </p>
            <p className="mt-2 text-muted-foreground">
              Phenomenology, not medicine. References in{" "}
              <span className="font-mono text-foreground">README.md</span>: the
              2026 5-HT2A 5&nbsp;Hz-oscillation study, Lisman &amp; Jensen&rsquo;s
              theta&ndash;gamma code, and Bressloff&ndash;Cowan form constants.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
