"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Room Tone — an acoustic ruler ───────────────────────────────────────────
// Measure the real reverberation of the room you're sitting in, then hear a
// piano note play *inside* that measured room.
//
// Three subsystems:
//   1. IR CAPTURE  — mic (getUserMedia) + ScriptProcessor records the decay
//      tail of a clap. Detects the transient onset, keeps ~1.8 s of tail.
//      No mic / denied → synthetic "demo room" IR (decaying filtered noise).
//   2. ANALYSIS    — Schroeder backward integration of the squared IR gives the
//      Energy Decay Curve (EDC, dB). RT60 via the robust T20 method: least-
//      squares fit of the EDC from −5 dB to −25 dB, slope extrapolated to a
//      60 dB drop. T30 (−5..−35) shown alongside.
//        Refs: M.R. Schroeder, "New Method of Measuring Reverberation Time,"
//              JASA 37 (1965); ISO 3382 (T20/T30 reverberation time).
//   3. AUDITION    — a Web Audio ConvolverNode whose buffer *is* the measured
//      IR. A synthesized piano-ish note is routed dry, or wet through the
//      convolver, so you literally hear it reverberate in your room. A/B toggle.
//
//   4. DISPLAY     — Canvas2D instrument: raw IR waveform, Schroeder EDC
//      (violet), the fitted decay line, dB grid, and the RT60 readout.
// ─────────────────────────────────────────────────────────────────────────────

const CAPTURE_SECONDS = 1.8; // length of decay tail we keep after the onset
const PREROLL_SECONDS = 0.03; // a hair of signal kept before the detected clap
const ONSET_THRESHOLD = 0.14; // peak sample level that counts as "a clap"
const LISTEN_TIMEOUT_MS = 8000; // give up waiting for a clap after this
const DISPLAY_POINTS = 1400; // downsampled points drawn for wave / EDC

// A pentatonic-ish spread of piano notes for the audition pads.
const NOTES: { label: string; hz: number }[] = [
  { label: "C3", hz: 130.81 },
  { label: "E♭3", hz: 155.56 },
  { label: "G3", hz: 196.0 },
  { label: "B♭3", hz: 233.08 },
  { label: "C4", hz: 261.63 },
  { label: "E♭4", hz: 311.13 },
];

interface Measurement {
  mode: "mic" | "demo";
  sampleRate: number;
  rt60T20: number;
  rt60T30: number;
  t5: number; // seconds — EDC crosses −5 dB
  t25: number; // seconds — EDC crosses −25 dB
  fitSlope: number; // dB per second (negative)
  fitIntercept: number; // dB at t=0 of the fit line
  wave: Float32Array; // downsampled IR (from direct sound), for the waveform
  edc: Float32Array; // downsampled Schroeder EDC in dB (from direct sound)
  duration: number; // seconds spanned by wave / edc
  irBuffer: AudioBuffer; // the impulse response, for the ConvolverNode
}

type Phase = "idle" | "listening" | "analyzing" | "ready";

/** Least-squares slope + intercept of y over x within an index range. */
function computeLinearFit(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: -1, intercept: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    sxy += xs[i] * ys[i];
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return { slope: -1, intercept: sy / n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

/** Linear-interpolated time (s) at which the EDC first drops to `db`. */
function crossingTime(edcDb: Float32Array, dtPerSample: number, db: number): number {
  for (let i = 1; i < edcDb.length; i++) {
    if (edcDb[i] <= db) {
      const a = edcDb[i - 1];
      const b = edcDb[i];
      const frac = b === a ? 0 : (db - a) / (b - a);
      return (i - 1 + frac) * dtPerSample;
    }
  }
  return edcDb.length * dtPerSample;
}

/** Downsample a Float32Array to `count` peak-holding points (for waveform). */
function downsamplePeak(src: Float32Array, count: number): Float32Array {
  const out = new Float32Array(count);
  const block = src.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * block);
    const end = Math.min(src.length, Math.floor((i + 1) * block) + 1);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const a = Math.abs(src[j]);
      if (a > peak) peak = a;
    }
    out[i] = peak;
  }
  return out;
}

/** Downsample a Float32Array to `count` averaged points (for the EDC). */
function downsampleAvg(src: Float32Array, count: number): Float32Array {
  const out = new Float32Array(count);
  const block = src.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * block);
    const end = Math.max(start + 1, Math.min(src.length, Math.floor((i + 1) * block)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += src[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/**
 * The core DSP. Given a raw impulse response, trim to the direct sound, run
 * Schroeder backward integration to get the EDC, and fit T20 / T30 → RT60.
 */
function analyzeImpulse(
  raw: Float32Array,
  sampleRate: number,
  ctx: AudioContext,
  mode: "mic" | "demo",
): Measurement {
  // 1. Locate the direct sound (global peak) and trim to start there.
  let peakIdx = 0;
  let peakVal = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = Math.abs(raw[i]);
    if (a > peakVal) {
      peakVal = a;
      peakIdx = i;
    }
  }
  const ir = raw.subarray(peakIdx);
  const n = ir.length;

  // 2. Schroeder backward integration: EDC[i] = Σ_{m≥i} h[m]²  (reverse cumsum).
  const edcLin = new Float32Array(n);
  let running = 0;
  for (let i = n - 1; i >= 0; i--) {
    running += ir[i] * ir[i];
    edcLin[i] = running;
  }
  const total = edcLin[0] > 0 ? edcLin[0] : 1e-12;
  const edcDb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    edcDb[i] = 10 * Math.log10(edcLin[i] / total + 1e-12);
  }

  // 3. T20 fit (−5 → −25 dB) and T30 fit (−5 → −35 dB), least squares vs time.
  const dt = 1 / sampleRate;
  const fitRange = (lo: number, hi: number) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      if (edcDb[i] <= lo && edcDb[i] >= hi) {
        xs.push(i * dt);
        ys.push(edcDb[i]);
      }
    }
    return computeLinearFit(xs, ys);
  };
  const t20 = fitRange(-5, -25);
  const t30 = fitRange(-5, -35);
  // RT60 = 60 dB / |slope|. Guard against degenerate (flat) slopes.
  const rt60From = (slope: number) =>
    slope < -1e-6 ? Math.min(6, 60 / -slope) : 0;
  const rt60T20 = rt60From(t20.slope);
  const rt60T30 = rt60From(t30.slope);

  const t5 = crossingTime(edcDb, dt, -5);
  const t25 = crossingTime(edcDb, dt, -25);

  // 4. Build the ConvolverNode buffer from the (peak-normalized) IR.
  const norm = peakVal > 0 ? 1 / peakVal : 1;
  const irBuffer = ctx.createBuffer(1, n, sampleRate);
  const chan = irBuffer.getChannelData(0);
  for (let i = 0; i < n; i++) chan[i] = ir[i] * norm;

  // 5. Downsample for display over a window that shows the decay to ~−65 dB.
  let showN = n;
  for (let i = 0; i < n; i++) {
    if (edcDb[i] <= -65) {
      showN = i;
      break;
    }
  }
  showN = Math.max(showN, Math.floor(0.3 * sampleRate));
  showN = Math.min(showN, n);
  const wave = downsamplePeak(ir.subarray(0, showN), DISPLAY_POINTS);
  const edc = downsampleAvg(edcDb.subarray(0, showN), DISPLAY_POINTS);

  return {
    mode,
    sampleRate,
    rt60T20,
    rt60T30,
    t5,
    t25,
    fitSlope: t20.slope,
    fitIntercept: t20.intercept,
    wave,
    edc,
    duration: showN / sampleRate,
    irBuffer,
  };
}

/** Synthesize a plausible room IR: exponentially-decaying, smoothed noise. */
function synthesizeDemoIR(sampleRate: number, rt60 = 0.85): Float32Array {
  const len = Math.floor(CAPTURE_SECONDS * sampleRate);
  const ir = new Float32Array(len);
  const tau = rt60 / 6.9; // e-folding time for a 60 dB (×~1000) drop
  // A sharp direct impulse, then decaying noise (the diffuse tail).
  let smooth = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t / tau);
    const noise = Math.random() * 2 - 1;
    // one-pole lowpass to color the noise a little (warmer tail)
    smooth = smooth * 0.5 + noise * 0.5;
    ir[i] = smooth * env * 0.6;
  }
  // Direct sound spike at the front.
  ir[0] = 1;
  ir[1] = 0.6;
  ir[2] = 0.3;
  return ir;
}

export default function RoomTonePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [wet, setWet] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // Audio graph (persistent across a session).
  const ctxRef = useRef<AudioContext | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);

  // Mic capture scratch.
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Live level for the "listening" meter, and refs mirroring state for the
  // requestAnimationFrame draw loop (avoids stale-closure / dep churn).
  const levelRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const measurementRef = useRef<Measurement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    measurementRef.current = measurement;
  }, [measurement]);

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (ctxRef.current) return ctxRef.current;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const conv = ctx.createConvolver();
    conv.normalize = false;
    const wetG = ctx.createGain();
    wetG.gain.value = 0.9;
    const dryG = ctx.createGain();
    dryG.gain.value = 0.9;
    conv.connect(wetG).connect(ctx.destination);
    dryG.connect(ctx.destination);
    ctxRef.current = ctx;
    convolverRef.current = conv;
    wetGainRef.current = wetG;
    dryGainRef.current = dryG;
    return ctx;
  }, []);

  const teardownMic = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    levelRef.current = 0;
  }, []);

  const finishWith = useCallback(
    (raw: Float32Array, sampleRate: number, mode: "mic" | "demo") => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      setPhase("analyzing");
      // Let the "analyzing" frame paint, then crunch the DSP.
      window.setTimeout(() => {
        const m = analyzeImpulse(raw, sampleRate, ctx, mode);
        if (convolverRef.current) convolverRef.current.buffer = m.irBuffer;
        setMeasurement(m);
        setPhase("ready");
      }, 60);
    },
    [],
  );

  const runDemo = useCallback(() => {
    const ctx = ensureContext();
    if (!ctx) {
      setError("This browser has no Web Audio support.");
      return;
    }
    void ctx.resume();
    teardownMic();
    const ir = synthesizeDemoIR(ctx.sampleRate);
    finishWith(ir, ctx.sampleRate, "demo");
  }, [ensureContext, teardownMic, finishWith]);

  const startMeasure = useCallback(async () => {
    setError(null);
    setMeasurement(null);
    const ctx = ensureContext();
    if (!ctx) {
      setError("This browser has no Web Audio support.");
      return;
    }
    await ctx.resume();

    const md =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || !md.getUserMedia) {
      setError("No microphone available — using a synthetic demo room.");
      runDemo();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      setError(
        "Microphone blocked or unavailable — measuring a synthetic demo room instead.",
      );
      runDemo();
      return;
    }

    streamRef.current = stream;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    sourceRef.current = source;
    processorRef.current = processor;

    const sr = ctx.sampleRate;
    const captureLen = Math.floor(CAPTURE_SECONDS * sr);
    const preroll = Math.floor(PREROLL_SECONDS * sr);
    const capture = new Float32Array(captureLen);
    const pre = new Float32Array(preroll);
    let preFill = 0; // ring write head for preroll
    let triggered = false;
    let writeIdx = 0;

    processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      const input = ev.inputBuffer.getChannelData(0);
      // Track live level for the meter.
      let blockPeak = 0;
      for (let i = 0; i < input.length; i++) {
        const a = Math.abs(input[i]);
        if (a > blockPeak) blockPeak = a;
      }
      levelRef.current = levelRef.current * 0.6 + blockPeak * 0.4;

      if (!triggered) {
        // Look for the clap onset within this block.
        let onsetAt = -1;
        for (let i = 0; i < input.length; i++) {
          if (Math.abs(input[i]) >= ONSET_THRESHOLD) {
            onsetAt = i;
            break;
          }
          // keep filling preroll ring
          pre[preFill % preroll] = input[i];
          preFill++;
        }
        if (onsetAt >= 0) {
          triggered = true;
          // copy preroll (oldest→newest) into the capture front
          const count = Math.min(preFill, preroll);
          const startRead = preFill % preroll;
          for (let k = 0; k < count; k++) {
            capture[writeIdx++] = pre[(startRead + k) % preroll];
            if (writeIdx >= captureLen) break;
          }
          // then the remainder of this block from the onset
          for (let i = onsetAt; i < input.length && writeIdx < captureLen; i++) {
            capture[writeIdx++] = input[i];
          }
        }
      } else {
        for (let i = 0; i < input.length && writeIdx < captureLen; i++) {
          capture[writeIdx++] = input[i];
        }
      }

      if (triggered && writeIdx >= captureLen) {
        const done = capture.slice(0, captureLen);
        teardownMic();
        finishWith(done, sr, "mic");
      }
    };

    // ScriptProcessor needs a path to destination to fire; mute it so the mic
    // doesn't feed back into the speakers.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute).connect(ctx.destination);

    setPhase("listening");
    timeoutRef.current = window.setTimeout(() => {
      if (!triggered) {
        setError(
          "No clap detected — clap once, firmly, near the mic. Try again or use the demo room.",
        );
        teardownMic();
        setPhase("idle");
      }
    }, LISTEN_TIMEOUT_MS);
  }, [ensureContext, runDemo, teardownMic, finishWith]);

  // Play a synthesized piano-ish note, routed dry or wet through the convolver.
  const playNote = useCallback(
    (hz: number, when = 0) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const t0 = ctx.currentTime + when;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(0.9, t0 + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0004, t0 + 1.9);

      const partials: { ratio: number; amp: number; type: OscillatorType }[] = [
        { ratio: 1, amp: 1.0, type: "sine" },
        { ratio: 2.01, amp: 0.45, type: "sine" },
        { ratio: 3.0, amp: 0.22, type: "triangle" },
        { ratio: 4.2, amp: 0.1, type: "sine" },
      ];
      for (const p of partials) {
        const osc = ctx.createOscillator();
        osc.type = p.type;
        osc.frequency.value = hz * p.ratio;
        const g = ctx.createGain();
        g.gain.value = p.amp;
        osc.connect(g).connect(env);
        osc.start(t0);
        osc.stop(t0 + 2.0);
      }

      const destWet = convolverRef.current;
      const destDry = dryGainRef.current;
      if (wet && destWet) env.connect(destWet);
      else if (destDry) env.connect(destDry);
      else env.connect(ctx.destination);
    },
    [wet],
  );

  const playPhrase = useCallback(() => {
    const seq = [0, 2, 4, 5, 4, 1];
    seq.forEach((idx, i) => playNote(NOTES[idx].hz, i * 0.34));
  }, [playNote]);

  // ── Canvas instrument display: one rAF loop, all data via refs ────────────
  useEffect(() => {
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 640;
      const cssH = canvas.clientHeight || 320;
      if (canvas.width !== Math.floor(cssW * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cssW;
      const H = cssH;

      // Background panel.
      ctx2d.fillStyle = "#0b0b12";
      ctx2d.fillRect(0, 0, W, H);

      const padL = 46;
      const padR = 14;
      const padT = 16;
      const padB = 28;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;

      const dbTop = 3;
      const dbBot = -66;
      const yOf = (db: number) =>
        padT + ((dbTop - db) / (dbTop - dbBot)) * plotH;

      // dB grid.
      ctx2d.strokeStyle = "rgba(255,255,255,0.06)";
      ctx2d.fillStyle = "rgba(255,255,255,0.34)";
      ctx2d.lineWidth = 1;
      ctx2d.font = "10px ui-monospace, monospace";
      for (let db = 0; db >= -60; db -= 10) {
        const y = yOf(db);
        ctx2d.beginPath();
        ctx2d.moveTo(padL, y);
        ctx2d.lineTo(W - padR, y);
        ctx2d.stroke();
        ctx2d.fillText(`${db}`, 8, y + 3);
      }

      const phaseNow = phaseRef.current;
      const m = measurementRef.current;

      if (phaseNow === "listening") {
        // Live input meter — a breathing bar that reacts to the room.
        const lvl = Math.min(1, levelRef.current * 3);
        ctx2d.fillStyle = "rgba(139,110,246,0.16)";
        ctx2d.fillRect(padL, padT, plotW, plotH);
        const barW = plotW * lvl;
        const grad = ctx2d.createLinearGradient(padL, 0, padL + plotW, 0);
        grad.addColorStop(0, "#4c3a9e");
        grad.addColorStop(1, "#b39bff");
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(padL, padT + plotH * 0.35, barW, plotH * 0.3);
        ctx2d.fillStyle = "rgba(255,255,255,0.72)";
        ctx2d.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx2d.fillText("Listening… clap once, firmly.", padL + 6, padT + plotH * 0.22);
        return;
      }

      if (phaseNow === "analyzing") {
        ctx2d.fillStyle = "rgba(255,255,255,0.6)";
        ctx2d.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx2d.fillText("Integrating decay curve…", padL + 6, padT + plotH * 0.5);
        return;
      }

      if (!m) {
        ctx2d.fillStyle = "rgba(255,255,255,0.28)";
        ctx2d.font = "13px ui-sans-serif, system-ui, sans-serif";
        ctx2d.fillText(
          "Measure a room to see its energy decay curve.",
          padL + 6,
          padT + plotH * 0.5,
        );
        return;
      }

      const dur = m.duration;
      const xOf = (t: number) => padL + (t / dur) * plotW;

      // Time axis ticks.
      ctx2d.fillStyle = "rgba(255,255,255,0.34)";
      ctx2d.font = "10px ui-monospace, monospace";
      const tickStep = dur > 1.2 ? 0.5 : 0.25;
      for (let t = 0; t <= dur + 1e-6; t += tickStep) {
        const x = xOf(t);
        ctx2d.fillText(`${t.toFixed(2)}s`, x - 10, H - 10);
      }

      // Raw IR waveform (dim), mirrored around the −33 dB midline region.
      const midY = padT + plotH * 0.5;
      const waveAmp = plotH * 0.22;
      ctx2d.strokeStyle = "rgba(160,140,220,0.28)";
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      for (let i = 0; i < m.wave.length; i++) {
        const x = padL + (i / m.wave.length) * plotW;
        const y = midY - m.wave[i] * waveAmp;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // Fitted T20 decay line (light violet, dashed).
      ctx2d.strokeStyle = "rgba(210,196,255,0.85)";
      ctx2d.lineWidth = 1.5;
      ctx2d.setLineDash([5, 4]);
      ctx2d.beginPath();
      const lineDbAt = (t: number) => m.fitSlope * t + m.fitIntercept;
      const t0line = 0;
      const t1line = dur;
      ctx2d.moveTo(xOf(t0line), yOf(Math.min(dbTop, lineDbAt(t0line))));
      ctx2d.lineTo(xOf(t1line), yOf(Math.max(dbBot, lineDbAt(t1line))));
      ctx2d.stroke();
      ctx2d.setLineDash([]);

      // Schroeder EDC (bright violet).
      ctx2d.strokeStyle = "#8b6ef6";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      for (let i = 0; i < m.edc.length; i++) {
        const t = (i / m.edc.length) * dur;
        const y = yOf(Math.max(dbBot, m.edc[i]));
        const x = xOf(t);
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // −5 dB and −25 dB fit markers.
      for (const [db, t] of [
        [-5, m.t5],
        [-25, m.t25],
      ] as const) {
        const y = yOf(db);
        const x = xOf(Math.min(dur, t));
        ctx2d.fillStyle = "rgba(179,155,255,0.9)";
        ctx2d.beginPath();
        ctx2d.arc(x, y, 3, 0, Math.PI * 2);
        ctx2d.fill();
      }

      // RT60 readout, big.
      ctx2d.fillStyle = "#e7e0ff";
      ctx2d.font = "600 30px ui-monospace, monospace";
      ctx2d.fillText(`${m.rt60T20.toFixed(2)} s`, padL + 8, padT + 34);
      ctx2d.fillStyle = "rgba(255,255,255,0.5)";
      ctx2d.font = "10px ui-monospace, monospace";
      ctx2d.fillText("RT60 · T20", padL + 8, padT + 48);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      teardownMic();
      if (ctxRef.current) void ctxRef.current.close();
    };
  }, [teardownMic]);

  const busy = phase === "listening" || phase === "analyzing";

  return (
    <div className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Room Tone · acoustic ruler
            </p>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[32px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Measure your room, then play a piano inside it.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Clap once. Room Tone records how the sound decays, computes the
            reverberation time (RT60) by Schroeder backward integration, and
            turns your room into a convolution reverb — so you can hear a note
            ring out in the exact space you&apos;re sitting in.
          </p>
        </header>

        {/* Steps */}
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Measure", "Clap once and let the tail decay."],
            ["2", "Read RT60", "See the energy decay curve & fit."],
            ["3", "Play through it", "Hear a note reverberate in your room."],
          ].map(([n, t, d]) => (
            <li
              key={n}
              className="rounded-lg border border-border bg-background/60 p-4"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {n}
              </span>
              <p className="mt-1 text-base font-medium">{t}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>

        {/* Instrument display */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Instrument · Schroeder EDC
            </p>
            {measurement && (
              <span
                className={`font-mono text-xs ${
                  measurement.mode === "demo"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {measurement.mode === "demo"
                  ? "Demo room — no mic"
                  : "Measured — live mic"}
              </span>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <canvas
              ref={canvasRef}
              className="block h-[300px] w-full sm:h-[340px]"
            />
          </div>

          {measurement && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["RT60 (T20)", `${measurement.rt60T20.toFixed(2)} s`],
                ["RT60 (T30)", `${measurement.rt60T30.toFixed(2)} s`],
                ["−5 dB at", `${(measurement.t5 * 1000).toFixed(0)} ms`],
                ["−25 dB at", `${(measurement.t25 * 1000).toFixed(0)} ms`],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-md border border-border bg-background/60 p-3"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {k}
                  </p>
                  <p className="mt-1 font-mono text-lg text-foreground">{v}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Controls */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startMeasure}
              disabled={busy}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {phase === "listening"
                ? "Listening for a clap…"
                : phase === "analyzing"
                  ? "Analyzing…"
                  : measurement
                    ? "Measure again"
                    : "Measure the room"}
            </button>
            <button
              onClick={runDemo}
              disabled={busy}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              Use demo room
            </button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Audition */}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Audition · play through the room
              </p>
              <div className="flex items-center gap-1 rounded-md border border-border p-1">
                <button
                  onClick={() => setWet(false)}
                  className={`min-h-[32px] rounded px-3 text-xs font-medium transition-colors ${
                    !wet
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Dry
                </button>
                <button
                  onClick={() => setWet(true)}
                  className={`min-h-[32px] rounded px-3 text-xs font-medium transition-colors ${
                    wet
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Wet (measured room)
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {NOTES.map((note) => (
                <button
                  key={note.label}
                  onClick={() => playNote(note.hz)}
                  disabled={!measurement}
                  className="min-h-[44px] min-w-[52px] rounded-md border border-border bg-background/60 px-3 font-mono text-sm text-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {note.label}
                </button>
              ))}
              <button
                onClick={playPhrase}
                disabled={!measurement}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                Play phrase
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {measurement
                ? "Toggle Dry / Wet as you play — Wet convolves each note with your measured impulse response."
                : "Measure a room first to load its impulse response into the convolver."}
            </p>
          </div>
        </section>

        <Link
          href="/dream"
          className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← back to the lab
        </Link>
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              How Room Tone works
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single clap is an approximate acoustic impulse. The mic records
                its decay tail — the room&apos;s <em>impulse response</em>.
              </p>
              <p>
                <strong className="text-foreground">Schroeder integration.</strong>{" "}
                Squaring the impulse response and integrating it{" "}
                <em>backwards</em> from the end yields a smooth energy decay curve
                (EDC), free of the jitter you get from a raw squared signal.
                (M.R. Schroeder, JASA 1965.)
              </p>
              <p>
                <strong className="text-foreground">T20 → RT60.</strong> Per ISO
                3382 we least-squares fit the EDC over the −5 dB to −25 dB span
                and extrapolate that slope to a full 60 dB drop. T20 is robust
                for short, slightly noisy claps; T30 (−5 to −35 dB) is shown too.
              </p>
              <p>
                <strong className="text-foreground">Audition.</strong> The
                impulse response becomes the buffer of a Web Audio
                ConvolverNode. Playing a note wet convolves it with your room, so
                you hear the exact reverberation you just measured.
              </p>
              <p className="text-xs">
                No mic or permission denied → a synthetic decaying-noise room
                keeps the whole tool demoable offline.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[40px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
