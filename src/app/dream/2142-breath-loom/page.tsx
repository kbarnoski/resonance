"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/**
 * 2142 · Breath Loom — an altered-states instrument with NO buttons and NO
 * screen to watch. You play it entirely with your BREATH. The sound is a
 * biofeedback loop: slow, coherent breathing is rewarded by resolving a harsh
 * inharmonic shimmer toward luminous consonance.
 *
 * INPUT  · microphone breath-envelope (low-band RMS + spectral hiss) → phase.
 * OUTPUT · audio-first Sethares stretched-partial resonant bank + haptic pulses
 *          on breath-phase transitions + a dim, deliberately secondary Canvas2D
 *          aurora ribbon.
 * STATE  · holotropic / pranayama ASCENSION — filling and rising, not dissolving.
 */

// ── Sethares stretched-partial constants ────────────────────────────────────
// A stretched timbre replaces the harmonic series f·n with f·n^log2(A) for a
// stretch factor A (Sethares, Tuning Timbre Spectrum Scale, 1993). With A=2.1
// the partials are mildly inharmonic — bell-like and luminous. A Plomp–Levelt
// dissonance curve over the interval between two such timbres has its DEEPEST
// consonance minimum at the *stretched* octave r=A=2.10 (dissonance ≈0.12),
// while the ordinary harmonic octave r=2.00 is comparatively harsh (≈0.33).
// The biofeedback migrates the drone's interval from R_DISS toward R_CONS as
// breathing coherence rises, and shrinks the beating detune toward stillness.
const F0 = 98; // Hz — a low G2 drone
const PARTIAL_COUNT = 7;
const STRETCH = 2.1;
const P_EXP = Math.log2(STRETCH); // ≈ 1.0704
const R_DISS = 1.98; // interval when incoherent — clashing, near the harmonic 8ve
const R_CONS = 2.1; // Sethares consonance minimum — the stretched octave
const BEAT_MAX_CENTS = 18; // fast, rough beating when incoherent
const BEAT_MIN_CENTS = 1.5; // near-still when fully coherent

type Phase = "idle" | "running";
type BreathPhase = "rest" | "inhale" | "hold" | "exhale";

interface Partial {
  a: OscillatorNode; // primary
  b: OscillatorNode; // beating companion
  g: GainNode;
  voice: 0 | 1;
  n: number;
  baseAmp: number;
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  drone: GainNode;
  tone: BiquadFilterNode;
  partials: Partial[];
  // reverb / resonance tail
  revSend: GainNode;
  revFeedback: GainNode;
  // mic breath analysis (optional — sim fallback drives the same params)
  stream: MediaStream | null;
  lowAnalyser: AnalyserNode | null;
  highAnalyser: AnalyserNode | null;
  lowBuf: Float32Array<ArrayBuffer> | null;
  highBuf: Float32Array<ArrayBuffer> | null;
}

// Live analysis state kept out of React so rAF never triggers a re-render.
interface Loom {
  raf: number;
  last: number;
  floor: number;
  ceil: number;
  envS: number;
  prevEnv: number;
  slope: number;
  hiss: number;
  breath: BreathPhase;
  breathSince: number;
  charge: number; // 0..1 accumulated inhalation "presence"
  pitchMul: number;
  coherence: number;
  lastInhaleAt: number;
  periods: number[]; // seconds between successive inhale onsets
  simT: number;
  simPeriod: number;
  ribbonPhase: number;
}

// Guarded haptic pulse — many devices/desktops return false; degrade silently.
function runHaptic(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    /* no-op — haptics unsupported */
  }
}

// Root-mean-square of a time-domain buffer = the amplitude envelope.
function computeRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

export default function BreathLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const loomRef = useRef<Loom | null>(null);
  const simulateRef = useRef(false);
  const reducedRef = useRef(false);
  const startedRef = useRef(false);
  const throttleRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [usingSim, setUsingSim] = useState(false);
  const [breathLabel, setBreathLabel] = useState<BreathPhase>("rest");
  const [coherencePct, setCoherencePct] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  // ── Build the Sethares resonant bank (called inside the Begin gesture) ─────
  const buildEngine = useCallback((ctx: AudioContext): Engine => {
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ctx.destination);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 2.5);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 500;
    tone.Q.value = 0.5;
    tone.connect(master);

    const drone = ctx.createGain();
    drone.gain.value = 0.09;
    drone.connect(tone);

    // Slow resonance tail — swells on exhale to make the release "descend".
    const revSend = ctx.createGain();
    revSend.gain.value = 0.12;
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const revFilter = ctx.createBiquadFilter();
    revFilter.type = "lowpass";
    revFilter.frequency.value = 1700;
    const revFeedback = ctx.createGain();
    revFeedback.gain.value = 0.55;
    drone.connect(revSend);
    revSend.connect(delay);
    delay.connect(revFilter);
    revFilter.connect(revFeedback);
    revFeedback.connect(delay);
    revFilter.connect(master);

    // The stretched-partial bank: two voices (root + interval), each partial a
    // pair of detuned oscillators so the roughness is audible amplitude beating.
    const partials: Partial[] = [];
    for (const voice of [0, 1] as const) {
      for (let n = 1; n <= PARTIAL_COUNT; n++) {
        const baseAmp = Math.pow(1 / n, 0.85) * (voice === 1 ? 0.7 : 1);
        const g = ctx.createGain();
        g.gain.value = baseAmp * 0.5;
        g.connect(drone);
        const a = ctx.createOscillator();
        a.type = "sine";
        const b = ctx.createOscillator();
        b.type = "sine";
        a.connect(g);
        b.connect(g);
        a.start();
        b.start();
        partials.push({ a, b, g, voice, n, baseAmp });
      }
    }

    return {
      ctx,
      master,
      drone,
      tone,
      partials,
      revSend,
      revFeedback,
      stream: null,
      lowAnalyser: null,
      highAnalyser: null,
      lowBuf: null,
      highBuf: null,
    };
  }, []);

  // ── Attach the mic → low-band envelope + high-band hiss analysers ──────────
  const attachMic = useCallback(async (engine: Engine): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const { ctx } = engine;
      const src = ctx.createMediaStreamSource(stream);

      // Low band ≈ breath body (rushing air, chest resonance).
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = "lowpass";
      lowFilter.frequency.value = 500;
      const lowAnalyser = ctx.createAnalyser();
      lowAnalyser.fftSize = 1024;
      src.connect(lowFilter);
      lowFilter.connect(lowAnalyser);

      // High band ≈ turbulent hiss (sharper on a controlled exhale).
      const highFilter = ctx.createBiquadFilter();
      highFilter.type = "highpass";
      highFilter.frequency.value = 2600;
      const highAnalyser = ctx.createAnalyser();
      highAnalyser.fftSize = 1024;
      src.connect(highFilter);
      highFilter.connect(highAnalyser);
      // NB: never connected to destination — no feedback howl.

      engine.stream = stream;
      engine.lowAnalyser = lowAnalyser;
      engine.highAnalyser = highAnalyser;
      engine.lowBuf = new Float32Array(new ArrayBuffer(lowAnalyser.fftSize * 4));
      engine.highBuf = new Float32Array(new ArrayBuffer(highAnalyser.fftSize * 4));
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Push current parameters into the resonant bank ─────────────────────────
  const applyAudio = useCallback(
    (
      engine: Engine,
      s: {
        level: number;
        brightness: number;
        interval: number;
        beatCents: number;
        charge: number;
        pitchMul: number;
        coherence: number;
      },
    ) => {
      const { ctx, partials, drone, tone, revSend, revFeedback } = engine;
      const t = ctx.currentTime;
      const beatRatio = Math.pow(2, s.beatCents / 1200);

      for (const pr of partials) {
        const voiceMul = pr.voice === 1 ? s.interval : 1;
        const base = F0 * voiceMul * s.pitchMul * Math.pow(pr.n, P_EXP);
        pr.a.frequency.setTargetAtTime(base, t, 0.08);
        pr.b.frequency.setTargetAtTime(base * beatRatio, t, 0.08);
        // Charge lifts the upper (shimmer) partials — "filling / rising".
        const shimmer = pr.n >= 4 ? 1 : 0.35;
        const amp = pr.baseAmp * (0.55 + s.charge * shimmer * 0.9);
        pr.g.gain.setTargetAtTime(amp, t, 0.1);
      }

      drone.gain.setTargetAtTime(0.08 + s.charge * 0.06, t, 0.15);
      tone.frequency.setTargetAtTime(
        420 + s.brightness * 3200 + s.charge * 1400,
        t,
        0.2,
      );
      // Exhale (falling charge) leans into the resonant tail so it descends.
      revSend.gain.setTargetAtTime(0.1 + (1 - s.charge) * 0.14, t, 0.3);
      revFeedback.gain.setTargetAtTime(0.5 + s.coherence * 0.12, t, 0.4);
    },
    [],
  );

  // ── Dim, secondary aurora ribbon ───────────────────────────────────────────
  const drawRibbon = useCallback(
    (loom: Loom, w: number, h: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Deep, calm trail wash — the screen is meant to recede.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(7, 8, 16, 0.16)";
      ctx.fillRect(0, 0, w, h);

      const env = Math.max(0, Math.min(1, loom.envS));
      const coh = loom.coherence;
      const cy = h * 0.5;
      // As coherence rises the ribbon warms from violet toward luminous near-white.
      const hue = 268 - coh * 40;
      const sat = 70 - coh * 45;
      const amp = h * (0.04 + env * 0.14 + loom.charge * 0.06);

      ctx.globalCompositeOperation = "lighter";
      const strands = reducedRef.current ? 2 : 4;
      for (let sIdx = 0; sIdx < strands; sIdx++) {
        const off = (sIdx - (strands - 1) / 2) * (8 + coh * 10);
        const alpha = (0.05 + coh * 0.09 + loom.charge * 0.05) * (1 - sIdx * 0.14);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const u = x / w;
          const y =
            cy +
            off +
            Math.sin(u * 6.2 + loom.ribbonPhase + sIdx * 0.7) * amp +
            Math.sin(u * 2.3 - loom.ribbonPhase * 0.6) * amp * 0.5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${68 + coh * 22}%, ${alpha})`;
        ctx.lineWidth = 1.4 + env * 2.2;
        ctx.stroke();
      }

      // A soft central bloom that fills with charge — presence rising.
      const bloom = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, h * 0.5);
      const bAlpha = 0.04 + loom.charge * 0.1 + coh * 0.05;
      bloom.addColorStop(0, `hsla(${hue}, ${sat}%, ${72 + coh * 20}%, ${bAlpha})`);
      bloom.addColorStop(1, "hsla(265, 60%, 40%, 0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
    },
    [],
  );

  // ── The breath-analysis + audio + render loop ──────────────────────────────
  const runFrame = useCallback(
    (now: number) => {
      const engine = engineRef.current;
      const loom = loomRef.current;
      if (!engine || !loom) return;

      let dt = (now - loom.last) / 1000;
      if (!(dt > 0) || dt > 0.1) dt = 0.016;
      loom.last = now;

      // 1) Acquire the breath envelope + spectral hiss.
      let env: number;
      let hiss: number;
      if (simulateRef.current || !engine.lowAnalyser) {
        // Simulated breath: a slow, gently regular cycle so the piece is always
        // reviewable, and slowly lengthens to demonstrate coherence being earned.
        loom.simT += dt;
        loom.simPeriod = Math.min(9, loom.simPeriod + dt * 0.03);
        const ph = (loom.simT % loom.simPeriod) / loom.simPeriod; // 0..1
        // Rise (inhale) 0–0.4, hold 0.4–0.55, fall (exhale) 0.55–1.
        let shape: number;
        if (ph < 0.4) shape = ph / 0.4;
        else if (ph < 0.55) shape = 1;
        else shape = 1 - (ph - 0.55) / 0.45;
        env = 0.08 + shape * 0.6;
        hiss = ph >= 0.55 ? 0.55 : 0.2;
      } else {
        engine.lowAnalyser.getFloatTimeDomainData(engine.lowBuf!);
        engine.highAnalyser!.getFloatTimeDomainData(engine.highBuf!);
        const low = computeRms(engine.lowBuf!);
        const high = computeRms(engine.highBuf!);
        // Adaptive per-room normalization: floor chases down, ceiling chases up.
        loom.floor += (low - loom.floor) * (low < loom.floor ? 0.05 : 0.001) * dt * 60;
        loom.ceil += (low - loom.ceil) * (low > loom.ceil ? 0.05 : 0.004) * dt * 60;
        const span = Math.max(0.002, loom.ceil - loom.floor);
        env = Math.max(0, Math.min(1, (low - loom.floor) / span));
        hiss = high / (high + low + 1e-6);
      }

      // 2) Smooth the envelope and estimate its slope.
      const prev = loom.envS;
      loom.envS += (env - loom.envS) * (1 - Math.exp(-dt * 6));
      const rawSlope = (loom.envS - prev) / dt;
      loom.slope += (rawSlope - loom.slope) * (1 - Math.exp(-dt * 5));
      loom.hiss += (hiss - loom.hiss) * (1 - Math.exp(-dt * 4));
      loom.prevEnv = prev;

      // 3) Classify the breath phase (with hysteresis via a minimum dwell time).
      const rel = loom.envS;
      const slope = loom.slope;
      let candidate: BreathPhase = loom.breath;
      if (slope > 0.14) candidate = "inhale";
      else if (slope < -0.11 || (loom.hiss > 0.45 && rel > 0.28 && slope < 0.04))
        candidate = "exhale";
      else if (Math.abs(slope) < 0.05 && rel > 0.5) candidate = "hold";
      else if (rel < 0.18 && Math.abs(slope) < 0.06) candidate = "rest";

      const nowSec = now / 1000;
      const dwell = nowSec - loom.breathSince;
      if (candidate !== loom.breath && dwell > 0.28) {
        const prevPhase = loom.breath;
        loom.breath = candidate;
        loom.breathSince = nowSec;
        // 4) Haptic on every transition; a longer pulse when a breath begins.
        if (candidate === "inhale") {
          runHaptic([18, 40, 18]);
          if (prevPhase === "exhale" || prevPhase === "rest") {
            const period = nowSec - loom.lastInhaleAt;
            if (loom.lastInhaleAt > 0 && period > 1.5 && period < 30) {
              loom.periods.push(period);
              if (loom.periods.length > 5) loom.periods.shift();
            }
            loom.lastInhaleAt = nowSec;
          }
        } else if (candidate === "hold") {
          runHaptic(30);
        } else {
          runHaptic(12);
        }
      }

      // 5) Charge — inhalation fills presence; hold locks it; exhale releases it.
      if (loom.breath === "inhale") loom.charge = Math.min(1, loom.charge + dt * 0.45);
      else if (loom.breath === "hold") loom.charge = Math.min(1, loom.charge + dt * 0.05);
      else if (loom.breath === "exhale") loom.charge = Math.max(0, loom.charge - dt * 0.22);
      else loom.charge = Math.max(0, loom.charge - dt * 0.12);

      // Descending resonance on exhale: glide the drone gently down, else recover.
      const pitchTarget = loom.breath === "exhale" ? 0.985 : 1.0;
      loom.pitchMul += (pitchTarget - loom.pitchMul) * (1 - Math.exp(-dt * 1.4));

      // 6) Coherence — the Signal→Biofeedback loop. Reward slow + regular breathing.
      let targetC = 0.12;
      if (loom.periods.length >= 2) {
        const mean = loom.periods.reduce((a, b) => a + b, 0) / loom.periods.length;
        const variance =
          loom.periods.reduce((a, b) => a + (b - mean) * (b - mean), 0) / loom.periods.length;
        const std = Math.sqrt(variance);
        const slowness = Math.max(0, Math.min(1, (mean - 4) / (11 - 4)));
        const regularity = Math.max(0, 1 - std / (mean * 0.4 + 1e-6));
        targetC = 0.12 + 0.88 * slowness * regularity;
      }
      // If breathing has stalled, let coherence decay rather than freeze.
      if (loom.lastInhaleAt > 0 && nowSec - loom.lastInhaleAt > 18) targetC = 0.12;
      loom.coherence += (targetC - loom.coherence) * (1 - Math.exp(-dt / 4));

      // 7) Map coherence onto the Sethares migration and drive the bank.
      const coh = loom.coherence;
      const interval = R_DISS + (R_CONS - R_DISS) * coh;
      // Beating shrinks with coherence; the inhale charge adds transient roughness.
      const beatCents =
        (BEAT_MAX_CENTS + (BEAT_MIN_CENTS - BEAT_MAX_CENTS) * coh) *
        (1 + loom.charge * 0.6 * (1 - coh));
      const brightness = 0.18 + 0.82 * coh;
      applyAudio(engine, {
        level: 0.08 + loom.charge * 0.06,
        brightness,
        interval,
        beatCents,
        charge: loom.charge,
        pitchMul: loom.pitchMul,
        coherence: coh,
      });

      // 8) Visuals (deliberately dim / secondary).
      loom.ribbonPhase += dt * (0.3 + loom.charge * 0.4);
      drawRibbon(loom, window.innerWidth, window.innerHeight);

      // 9) Throttled React sync for the small HUD.
      throttleRef.current += dt;
      if (throttleRef.current > 0.15) {
        throttleRef.current = 0;
        setBreathLabel(loom.breath);
        setCoherencePct(Math.round(coh * 100));
      }

      loom.raf = requestAnimationFrame(runFrame);
    },
    [applyAudio, drawRibbon],
  );

  // ── Begin gesture: create + resume the AudioContext, then loop ─────────────
  const begin = useCallback(
    async (forceSim: boolean) => {
      if (startedRef.current) return;
      const Ctor =
        typeof window !== "undefined" &&
        (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) {
        setMicError("This browser blocks the Web Audio API, so the loom can't sound.");
        return;
      }
      startedRef.current = true;
      reducedRef.current = prefersReducedMotion();
      const ctx = new Ctor();
      const engine = buildEngine(ctx);
      engineRef.current = engine;
      try {
        await ctx.resume();
      } catch {
        /* resume best-effort */
      }

      let sim = forceSim;
      if (!forceSim) {
        const ok = await attachMic(engine);
        if (!ok) {
          sim = true;
          setMicError(
            "No microphone permission — running the built-in breath so you can still hear it. Reload and allow the mic to play it with your own breath.",
          );
        }
      }
      simulateRef.current = sim;
      setUsingSim(sim);

      loomRef.current = {
        raf: 0,
        last: performance.now(),
        floor: 0.004,
        ceil: 0.02,
        envS: 0,
        prevEnv: 0,
        slope: 0,
        hiss: 0.2,
        breath: "rest",
        breathSince: performance.now() / 1000,
        charge: 0,
        pitchMul: 1,
        coherence: 0.12,
        lastInhaleAt: 0,
        periods: [],
        simT: 0,
        simPeriod: 5.5,
        ribbonPhase: 0,
      };

      setPhase("running");
      loomRef.current.raf = requestAnimationFrame(runFrame);
    },
    [attachMic, buildEngine, runFrame],
  );

  // ── Teardown: rAF, oscillators, mic stream, AudioContext ───────────────────
  useEffect(() => {
    return () => {
      const loom = loomRef.current;
      if (loom?.raf) cancelAnimationFrame(loom.raf);
      loomRef.current = null;
      const engine = engineRef.current;
      engineRef.current = null;
      startedRef.current = false;
      if (engine) {
        try {
          engine.master.gain.setTargetAtTime(0, engine.ctx.currentTime, 0.3);
        } catch {
          /* context may be closing */
        }
        engine.partials.forEach((p) => {
          try {
            p.a.stop();
            p.b.stop();
          } catch {
            /* already stopped */
          }
        });
        engine.stream?.getTracks().forEach((t) => t.stop());
        const ctx = engine.ctx;
        window.setTimeout(() => {
          if (ctx.state !== "closed") ctx.close().catch(() => undefined);
        }, 500);
      }
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#070810" }}
      />

      {/* Read the design notes — corner affordance. */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* Idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2142 · pranayama ascension · breath-played
          </span>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl">
            Breath Loom
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            An instrument with no buttons and nothing to watch. You play it with your breath. Slow,
            coherent breathing is rewarded: a harsh inharmonic shimmer resolves toward luminous
            consonance. Close your eyes — it lives in your ears and body.
          </p>
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => void begin(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin (needs mic)
            </button>
            <button
              type="button"
              onClick={() => void begin(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Demo without mic
            </button>
          </div>
          {micError && <p className="max-w-md text-sm text-destructive">{micError}</p>}
          <p className="max-w-md text-sm text-muted-foreground">
            Breathe slowly through the nose. Long, even breaths calm the beating; a held breath locks
            a shimmering sustain. Best with headphones.
          </p>
        </div>
      )}

      {/* Running HUD — minimal, secondary to the sound. */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Breath Loom
              </span>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
                {breathLabel} · coherence {coherencePct}%
              </p>
              {usingSim && (
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  simulated breath
                </p>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-1 p-4">
            <p className="text-center text-sm text-muted-foreground">
              Inhale swells and charges the drone · hold locks the shimmer · exhale releases a
              descending resonance · slower + more even = more consonant.
            </p>
            {micError && <p className="text-center text-sm text-destructive">{micError}</p>}
          </div>
        </>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question.</span> What if an altered-states
                instrument had no buttons and no screen — you play it entirely with your breath, and
                the sound is a biofeedback loop that rewards slow, coherent breathing by resolving
                from harsh inharmonic shimmer toward luminous consonance?
              </p>
              <p>
                <span className="text-foreground">Breath as the sole input.</span> The mic is split
                into a low band (≈&lt;500 Hz, the body of the breath) and a high band (≈&gt;2.6 kHz,
                turbulent hiss). The low-band RMS is the amplitude envelope; a rising smooth slope
                reads as inhale, an elevated plateau as a breath-hold, and a falling or hissy slope
                as exhale. No touch, no buttons beyond Begin.
              </p>
              <p>
                <span className="text-foreground">Sethares stretched partials.</span> Each drone
                voice is a bank of {PARTIAL_COUNT} partials at f·n^log₂(A) with stretch A={STRETCH}{" "}
                (Sethares, 1993) — mildly inharmonic, bell-like. A Plomp–Levelt dissonance curve over
                the interval between two such timbres has its deepest consonance minimum at the{" "}
                <span className="text-foreground">stretched</span> octave r=A={R_CONS}, while the
                ordinary harmonic octave r=2.0 is comparatively harsh. Coherence migrates the interval
                from {R_DISS} toward {R_CONS} and shrinks the beating detune from {BEAT_MAX_CENTS}¢
                toward {BEAT_MIN_CENTS}¢.
              </p>
              <p>
                <span className="text-foreground">The biofeedback loop.</span> A running measure of
                breathing coherence — slowness (longer breaths) × regularity (low variance of breath
                periods) — is the consonance parameter. This is the Signal→Biofeedback loop of the
                2026 CHI cardio-respiratory model rendered as harmony: your physiology becomes
                real-time guidance you hear rather than read.
              </p>
              <p>
                <span className="text-foreground">Ascension, not dissolution.</span> Inhalation{" "}
                <span className="text-foreground">fills</span> — charge lifts the upper shimmer
                partials and opens the tone; a hold locks the sustain; exhale releases a slow
                descending resonance. The arc builds presence and luminous coherence rather than
                draining away.
              </p>
              <p className="text-foreground">
                Safety: audio-first, no strobe or flicker. The Canvas2D ribbon is deliberately dim and
                secondary; all its luminance changes are slow drifts, and prefers-reduced-motion
                thins it further. Haptics are short, guarded pulses on breath-phase changes only.
              </p>
            </div>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="absolute bottom-3 right-3 z-10 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
    </main>
  );
}
