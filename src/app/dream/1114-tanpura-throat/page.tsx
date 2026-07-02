"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createEngine, type TanpuraEngine } from "./audio";
import { DRONE_ROOT_HZ } from "./strings";
import {
  bandEnergyDb,
  detectPitchHz,
  mulberry32,
  normDb,
} from "./pitch";

/* ───────────────────────────────────────────────────────────────────────────
   1114-tanpura-throat — "Tanpura Throat"

   ONE question: What if singing into a tanpura made its sympathetic strings
   physically ring back — a drone that resonates with the harmonics of your
   voice?

   The mic is measured only (never routed to the speakers). Every frame we pull
   the fundamental (time-domain autocorrelation, pitch.ts) and the energy your
   voice puts into each partial (AnalyserNode FFT). That energy re-plucks a bank
   of twelve Karplus-Strong "sympathetic strings" (strings.ts) tuned to a just-
   intonation drone over ~110 Hz, over a tanpura drone bed that re-plucks itself.
   A seeded "cantor" (a synthetic vowel singer) drives the same analyser so the
   temple sings on its own with no mic and no interaction. The warm Canvas2D
   mandala shows each string as a ring that visibly vibrates when it is struck.
─────────────────────────────────────────────────────────────────────────── */

const SEED = 0x7a9b21c4;

// ── Visual state shared between the audio loop and the render ───────────────
interface RingState {
  env: number[]; // smoothed partial glow, 0..1
  wobble: number[]; // decaying strike amplitude, 0..1
  baseline: number[]; // slow floor per partial for onset detection
  lastPluckMs: number[];
  drift: number; // global slow rotation
  pitchMidi: number; // smoothed detected pitch (or -1)
  rms: number;
}

// Warm palette: brass / amber / gold on umber-plum, indigo accents on the rim.
function ringColor(index: number, count: number, glow: number): string {
  // Inner strings brass/amber, outer strings toward gold, rim toward indigo.
  const t = index / Math.max(1, count - 1);
  const hue = 34 + t * 20 - glow * 6; // 34 (brass) → ~54 (gold)
  const indigoMix = t > 0.72 ? (t - 0.72) * 3 : 0;
  const h = hue * (1 - indigoMix) + 258 * indigoMix;
  const light = 40 + glow * 40;
  const alpha = 0.18 + glow * 0.72;
  return `hsla(${h.toFixed(0)}, ${(72 - indigoMix * 20).toFixed(0)}%, ${light.toFixed(0)}%, ${alpha.toFixed(3)})`;
}

function drawMandala(
  c2d: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: RingState,
  nowMs: number,
  reducedMotion: boolean,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Warm-dark ground (umber → plum), NOT pure black.
  const bg = c2d.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, Math.max(w, h) * 0.75);
  bg.addColorStop(0, "#241318");
  bg.addColorStop(0.6, "#1a0f14");
  bg.addColorStop(1, "#120a12");
  c2d.fillStyle = bg;
  c2d.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.52;
  const count = s.env.length;
  const maxR = Math.min(w, h) * 0.44;
  const minR = maxR * 0.12;
  const phase = reducedMotion ? 0 : nowMs * 0.001;

  c2d.save();
  c2d.translate(cx, cy);
  c2d.rotate(s.drift);

  // Faint radial filaments for the temple's warp threads.
  c2d.lineWidth = 1;
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    c2d.strokeStyle = "rgba(210,150,90,0.05)";
    c2d.beginPath();
    c2d.moveTo(Math.cos(ang) * minR, Math.sin(ang) * minR);
    c2d.lineTo(Math.cos(ang) * maxR, Math.sin(ang) * maxR);
    c2d.stroke();
  }

  // Each string is a ring; a struck ring bulges into a decaying standing wave.
  c2d.lineJoin = "round";
  for (let i = 0; i < count; i++) {
    const r = minR + (maxR - minR) * (i / Math.max(1, count - 1));
    const glow = Math.min(1, s.env[i] * 0.7 + s.wobble[i]);
    const nodes = 2 + i; // more nodes on higher strings → tighter standing wave
    const amp = s.wobble[i] * r * 0.16;
    const spin = reducedMotion ? 0 : phase * (0.3 + i * 0.05) * (i % 2 ? 1 : -1);

    c2d.beginPath();
    const steps = 120;
    for (let k = 0; k <= steps; k++) {
      const ang = (k / steps) * Math.PI * 2;
      const wob = amp * Math.sin(nodes * ang + spin);
      const rr = r + wob;
      const x = Math.cos(ang) * rr;
      const y = Math.sin(ang) * rr;
      if (k === 0) c2d.moveTo(x, y);
      else c2d.lineTo(x, y);
    }
    c2d.closePath();
    c2d.strokeStyle = ringColor(i, count, glow);
    c2d.lineWidth = 1.2 + glow * 3.2;
    c2d.shadowBlur = 6 + glow * 22;
    c2d.shadowColor = ringColor(i, count, Math.min(1, glow + 0.2));
    c2d.stroke();
  }
  c2d.shadowBlur = 0;
  c2d.restore();

  // Center core: the drone root, breathing with overall energy.
  const totalGlow = Math.min(1, s.env.reduce((a, b) => a + b, 0) / count + s.rms * 2);
  const breathe = reducedMotion ? 1 : 1 + 0.06 * Math.sin(nowMs * 0.0022);
  const coreR = minR * (0.9 + 0.5 * totalGlow) * breathe;
  const core = c2d.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
  core.addColorStop(0, `hsla(44, 90%, ${(66 + totalGlow * 20).toFixed(0)}%, ${(0.85).toFixed(2)})`);
  core.addColorStop(0.5, `hsla(34, 85%, 52%, ${(0.35 + totalGlow * 0.3).toFixed(2)})`);
  core.addColorStop(1, "transparent");
  c2d.fillStyle = core;
  c2d.beginPath();
  c2d.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
  c2d.fill();

  // A soft pitch marker: a warm dot orbiting at a radius set by your note.
  if (s.pitchMidi > 0) {
    const rootMidi = 69 + 12 * Math.log2(DRONE_ROOT_HZ / 440);
    const tt = Math.max(0, Math.min(1, (s.pitchMidi - rootMidi) / 24));
    const pr = minR + (maxR - minR) * tt;
    const pa = (reducedMotion ? 0 : nowMs * 0.0006) + s.drift;
    c2d.fillStyle = "hsla(48, 95%, 78%, 0.9)";
    c2d.shadowBlur = 16;
    c2d.shadowColor = "hsla(44,95%,70%,0.9)";
    c2d.beginPath();
    c2d.arc(cx + Math.cos(pa) * pr, cy + Math.sin(pa) * pr, 4 + s.rms * 30, 0, Math.PI * 2);
    c2d.fill();
    c2d.shadowBlur = 0;
  }
}

export default function TanpuraThroatPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const engineRef = useRef<TanpuraEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const micOnRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const rngRef = useRef<() => number>(mulberry32(SEED));

  const [showNotes, setShowNotes] = useState(false);

  const ringRef = useRef<RingState>({
    env: [],
    wobble: [],
    baseline: [],
    lastPluckMs: [],
    drift: 0,
    pitchMidi: -1,
    rms: 0,
  });
  const nextDroneAtRef = useRef(0);
  const droneStepRef = useRef(0);

  // ── The per-frame analyse + render loop (stable; reads refs only) ─────────
  const loop = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const rng = rngRef.current;
    if (!engine) return;

    const { ctx, analyser, timeBuf, freqBuf, freqs, droneCycle } = engine;
    const nowSec = ctx.currentTime;
    const nowMs = performance.now();
    const ring = ringRef.current;
    if (ring.env.length !== freqs.length) {
      ring.env = new Array(freqs.length).fill(0);
      ring.wobble = new Array(freqs.length).fill(0);
      ring.baseline = new Array(freqs.length).fill(0);
      ring.lastPluckMs = new Array(freqs.length).fill(0);
    }

    // Keep the autonomous singer breathing (drives detection with no mic).
    engine.updateCantor(nowSec, rng);

    // --- Read the analyser (mic OR cantor, same node) ---
    analyser.getFloatTimeDomainData(timeBuf as Float32Array<ArrayBuffer>);
    let rms = 0;
    for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
    rms = Math.sqrt(rms / timeBuf.length);
    ring.rms = rms;

    const hz = detectPitchHz(timeBuf, ctx.sampleRate);
    if (hz > 0) {
      const midi = 69 + 12 * Math.log2(hz / 440);
      ring.pitchMidi = ring.pitchMidi < 0 ? midi : ring.pitchMidi * 0.7 + midi * 0.3;
    } else {
      ring.pitchMidi = -1;
    }

    analyser.getFloatFrequencyData(freqBuf as Float32Array<ArrayBuffer>);

    // --- Voice-energy → sympathetic plucks, one string per partial ---
    for (let i = 0; i < freqs.length; i++) {
      const e = normDb(bandEnergyDb(freqBuf, ctx.sampleRate, analyser.fftSize, freqs[i], 2));
      ring.env[i] = ring.env[i] * 0.8 + e * 0.2; // glow
      ring.baseline[i] = ring.baseline[i] * 0.97 + e * 0.03; // slow floor
      const rising = e - ring.baseline[i];
      if (e > 0.4 && rising > 0.1 && nowMs - ring.lastPluckMs[i] > 150) {
        ring.lastPluckMs[i] = nowMs;
        const strength = Math.min(0.85, 0.2 + rising * 2.2);
        engine.pluck(i, strength, nowSec + 0.005, rng);
        ring.wobble[i] = Math.min(1, ring.wobble[i] + strength);
      }
      // Standing-wave amplitude decays naturally each frame.
      ring.wobble[i] *= 0.955;
    }

    // --- Detected fundamental: ring the matching string directly ---
    if (ring.pitchMidi > 0 && rms > 0.02) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < freqs.length; i++) {
        const m = 69 + 12 * Math.log2(freqs[i] / 440);
        const d = Math.abs(m - ring.pitchMidi);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD < 0.7 && nowMs - ring.lastPluckMs[best] > 130) {
        ring.lastPluckMs[best] = nowMs;
        const strength = Math.min(0.9, 0.3 + rms * 5);
        engine.pluck(best, strength, nowSec + 0.005, rng);
        ring.wobble[best] = Math.min(1, ring.wobble[best] + strength);
      }
    }

    // --- Tanpura drone bed: re-pluck a drone string on a slow cycle ---
    if (nowSec >= nextDroneAtRef.current) {
      nextDroneAtRef.current = nowSec + 1.05;
      const idx = droneCycle[droneStepRef.current % droneCycle.length];
      droneStepRef.current += 1;
      engine.pluck(idx, 0.5, nowSec + 0.01, rng);
      ring.wobble[idx] = Math.min(1, ring.wobble[idx] + 0.5);
    }

    // Slow global drift (frozen under reduced motion).
    if (!reducedMotionRef.current) ring.drift += 0.0007;

    if (canvas) {
      const g = canvas.getContext("2d");
      if (g) drawMandala(g, canvas, ring, nowMs, reducedMotionRef.current);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const runStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    let engine: TanpuraEngine;
    try {
      engine = createEngine(rngRef.current);
    } catch {
      setNotice("Audio could not start on this device. Try reloading in a different browser.");
      return;
    }
    engineRef.current = engine;
    if (engine.ctx.state === "suspended") {
      try {
        await engine.ctx.resume();
      } catch {
        /* resume best-effort */
      }
    }

    // Start sounding/moving immediately with the autonomous cantor.
    rafRef.current = requestAnimationFrame(loop);

    // Then try the mic and cross-fade to the live voice if granted.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      engine.connectMic(stream);
      micOnRef.current = true;
      setMicOn(true);
      setNotice(null);
    } catch {
      micOnRef.current = false;
      setMicOn(false);
      setNotice(
        "No microphone — the temple sings to itself. Grant mic access and reload to join it with your voice.",
      );
    }
  }, [loop]);

  // Detect reduced-motion preference once.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = () => {
      reducedMotionRef.current = mq.matches;
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Cleanup on unmount: rAF, audio nodes, mic stream (via engine.dispose).
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#120a12] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-between px-6 py-8">
        <header className="w-full max-w-xl text-center">
          <h1 className="font-serif text-2xl text-white sm:text-3xl">Tanpura Throat</h1>
          <p className="mt-3 text-base text-white/80">
            Sing into it and a bank of just-intonation sympathetic strings rings back — a
            physical-modeling drone that answers the harmonics of your voice.
          </p>
        </header>

        <div className="flex w-full max-w-xl flex-col items-center gap-4">
          {!started ? (
            <button
              type="button"
              onClick={runStart}
              className="min-h-[44px] rounded-full bg-amber-500/90 px-8 py-2.5 text-lg font-semibold text-black shadow-lg transition-colors hover:bg-amber-400 active:bg-amber-500"
            >
              Start — sing into it
            </button>
          ) : (
            <p className="min-h-[44px] text-center text-base text-white/95">
              <span
                className={micOn ? "text-emerald-300/95" : "text-amber-300/95"}
                aria-hidden
              >
                ●
              </span>{" "}
              {micOn ? "listening" : "auto (sing to join)"}
            </p>
          )}

          {notice && (
            <p className="max-w-md text-center text-base text-rose-300">{notice}</p>
          )}
        </div>

        <footer className="w-full max-w-xl text-center">
          <p className="text-base text-white/55">
            Your voice is measured only, never played back or recorded. Nothing leaves this device.
          </p>
          <div className="mt-3 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] text-base text-white/75 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
            >
              {showNotes ? "Hide design notes" : "Design notes"}
            </button>
            <Link
              href="/dream/1114-tanpura-throat/README.md"
              className="min-h-[44px] py-2.5 text-base text-white/55 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white/80"
            >
              README
            </Link>
          </div>

          {showNotes && (
            <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-white/10 bg-black/40 p-5 text-left text-base leading-relaxed text-white/75 backdrop-blur">
              <p>
                <span className="text-amber-300/95">What it does.</span> The mic is analysed, not
                heard. Each frame we estimate your fundamental with time-domain autocorrelation and
                measure the energy sitting on each partial with an FFT. That energy re-plucks twelve{" "}
                <span className="text-white/90">Karplus-Strong</span> waveguide strings tuned to a
                just-intonation drone over ~110&nbsp;Hz, over a self-plucking tanpura drone bed.
              </p>
              <p className="mt-3">
                <span className="text-violet-300">Never silent.</span> A seeded &quot;cantor&quot; —
                a synthetic vowel singer — drives the same analyser, so with no mic the strings still
                answer. All randomness is a seeded mulberry32 PRNG; motion honors{" "}
                <span className="text-white/90">prefers-reduced-motion</span>.
              </p>
              <p className="mt-3 text-white/55">
                Lineage: the Indian tanpura &amp; its jvari drone, sitar/sarangi tarab strings,
                Karplus &amp; Strong (1983), La Monte Young&apos;s <em>Dream House</em>, Pauline
                Oliveros&apos; <em>Deep Listening</em>. Full references in the README.
              </p>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
