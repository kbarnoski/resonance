"use client";

/**
 * 513-kids-shadow-still
 * "What if a child's movement pulled a sound apart from its echo —
 *  and going still let the two line up and cancel into a hollow hush?"
 *
 * Visible renderer: inline SVG (absolutely no Canvas2D/WebGL for visible output).
 * Pixel analysis: one OFFSCREEN canvas, never displayed, used only for frame-diff.
 * Audio: Web Audio comb filter (dry + DelayNode copy) — motion energy → delay time.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ─── constants ────────────────────────────────────────────────────────────────

/** Comb delay range in seconds */
const DELAY_MIN_S = 0.00005;   // ~0.05 ms safety floor
const DELAY_MAX_S = 0.010;     // 10 ms — full flanging swoosh

/** Number of comb "teeth" bars in the spectrum strip */
const COMB_BARS = 40;

/** Motion energy smoothing (lower = smoother / slower response) */
const MOTION_SMOOTH = 0.08;

/** Demo oscillation period in ms */
const DEMO_PERIOD_MS = 4800;

/** Idle ms before auto-demo resumes after real motion */
const IDLE_RESUME_MS = 3500;

/** Base frequency for the shimmer tone (A2 — warm, kids-safe) */
const BASE_FREQ = 110;

// ─── helpers (no "use" prefix) ────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Compute the comb filter magnitude response at normalised freq k/N.
 *  normFreq maps 0..1 to 0..8000 Hz (the audible range after lowpass).
 *  |H(f)| = |1 + g * e^(-j*2π*f*delay)| where g ≈ feedback gain.
 *  Returns 0..1 (normalised by peak). */
function combMagnitude(normFreq: number, delayS: number, feedback = 0.7): number {
  const freqHz = normFreq * 8000; // 0..8000 Hz
  const phase = 2 * Math.PI * freqHz * delayS;
  const re = 1 + feedback * Math.cos(phase);
  const im = feedback * Math.sin(phase);
  return Math.sqrt(re * re + im * im) / (1 + feedback); // normalise by peak
}

/** Map motion energy (0..1) → delay time (seconds). */
function energyToDelay(energy: number): number {
  // When still (energy≈0), delay near anti-phase point for BASE_FREQ.
  // Anti-phase: delay = 1/(2*BASE_FREQ) = ~4.5 ms for 110 Hz.
  // Moving (energy≈1), delay drifts to DELAY_MAX_S (full flange).
  const antiPhase = clamp(1 / (2 * BASE_FREQ), DELAY_MIN_S, DELAY_MAX_S); // ~4.545 ms
  // Interpolate: still → antiPhase; moving → DELAY_MAX_S
  return lerp(antiPhase, DELAY_MAX_S, energy);
}

// ─── audio builder ────────────────────────────────────────────────────────────

interface AudioRig {
  ctx: AudioContext;
  delayNode: DelayNode;
  masterGain: GainNode;
  setDelay: (s: number) => void;
  teardown: () => void;
}

function buildAudioRig(): AudioRig {
  const ctx = new AudioContext();

  // ── tone source: 2 oscillators (fundamental + gentle 2nd harmonic) ──
  const srcGain = ctx.createGain();
  srcGain.gain.value = 0.38;

  [BASE_FREQ, BASE_FREQ * 2, BASE_FREQ * 3].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    // Very slight LFO shimmer on each partial
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12 + i * 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5 + i * 0.3;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const partialGain = ctx.createGain();
    partialGain.gain.value = [0.6, 0.25, 0.10][i];
    osc.connect(partialGain);
    partialGain.connect(srcGain);
    osc.start();
    lfo.start();
  });

  // ── comb filter: dry + delayed copy with feedback ──
  const delayNode = ctx.createDelay(0.05); // max 50 ms
  delayNode.delayTime.value = 1 / (2 * BASE_FREQ); // start at anti-phase

  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = 0.65;

  const combOutGain = ctx.createGain();
  combOutGain.gain.value = 0.5; // mix dry + wet

  // dry path: srcGain → combOutGain
  srcGain.connect(combOutGain);

  // delay path: srcGain → delayNode → combOutGain
  srcGain.connect(delayNode);
  delayNode.connect(combOutGain);

  // mild feedback loop
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);

  // ── master chain: lowpass + compressor + master gain ──
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 8000;
  lowpass.Q.value = 0.5;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  compressor.knee.value = 6;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.45;

  combOutGain.connect(lowpass);
  lowpass.connect(compressor);
  compressor.connect(masterGain);
  masterGain.connect(ctx.destination);

  const setDelay = (s: number) => {
    const safe = clamp(s, DELAY_MIN_S, DELAY_MAX_S);
    delayNode.delayTime.setTargetAtTime(safe, ctx.currentTime, 0.04);
  };

  const teardown = () => {
    ctx.close().catch(() => undefined);
  };

  return { ctx, delayNode, masterGain, setDelay, teardown };
}

// ─── motion detector via offscreen canvas ─────────────────────────────────────

interface MotionDetector {
  start: () => Promise<void>;
  stop: () => void;
  getEnergy: () => number;
  getCameraError: () => string | null;
}

function makeMotionDetector(): MotionDetector {
  // One offscreen canvas — never displayed, only pixel scratch
  const offscreen = document.createElement("canvas");
  offscreen.width = 64;
  offscreen.height = 48;
  const octx = offscreen.getContext("2d", { willReadFrequently: true });

  let video: HTMLVideoElement | null = null;
  let stream: MediaStream | null = null;
  let prevPixels: Uint8ClampedArray | null = null;
  let smoothEnergy = 0;
  let cameraError: string | null = null;
  let running = false;
  let rafId = 0;

  const tick = () => {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    if (!video || !octx || video.readyState < 2) return;

    octx.drawImage(video, 0, 0, 64, 48);
    const frame = octx.getImageData(0, 0, 64, 48).data;

    if (prevPixels) {
      let diff = 0;
      const len = frame.length;
      for (let i = 0; i < len; i += 4) {
        // luminance diff
        const dr = frame[i] - prevPixels[i];
        const dg = frame[i + 1] - prevPixels[i + 1];
        const db = frame[i + 2] - prevPixels[i + 2];
        diff += Math.abs(0.299 * dr + 0.587 * dg + 0.114 * db);
      }
      const rawEnergy = clamp(diff / (64 * 48 * 30), 0, 1);
      smoothEnergy = lerp(smoothEnergy, rawEnergy, MOTION_SMOOTH);
    }

    // store copy
    prevPixels = new Uint8ClampedArray(frame);
  };

  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 64, height: 48 },
        audio: false,
      });
      video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      running = true;
      rafId = requestAnimationFrame(tick);
    } catch {
      cameraError = "Camera not available — running auto-demo";
    }
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((t) => t.stop());
    video = null;
    stream = null;
  };

  return {
    start,
    stop,
    getEnergy: () => smoothEnergy,
    getCameraError: () => cameraError,
  };
}

// ─── types ────────────────────────────────────────────────────────────────────

type AppPhase = "idle" | "running";

interface VisState {
  /** Smoothed motion energy 0..1 */
  energy: number;
  /** Current delay in seconds */
  delayS: number;
  /** Echo-shadow offset in SVG viewBox units */
  echoOffset: number;
  /** Comb spectrum bar heights 0..1 */
  combBars: number[];
  /** Auto-demo phase in ms */
  demoPhase: number;
  /** Whether we're using auto-demo (no real motion) */
  isDemo: boolean;
  /** Whether all's quiet (near anti-phase) */
  isHush: boolean;
  /** Timestamp of last real motion detection */
  lastRealMotionMs: number;
}

// ─── shadow path helpers ──────────────────────────────────────────────────────

/** A simple kid-silhouette: a blob shape centered at (cx,cy), width w, height h.
 *  Returns an SVG path `d` attribute string. */
function kidSilhouettePath(cx: number, cy: number, w: number, h: number): string {
  // Body: rounded rectangle
  const bx = cx - w * 0.28;
  const by = cy - h * 0.1;
  const bw = w * 0.56;
  const bh = h * 0.42;
  // Head
  const hx = cx;
  const hy = cy - h * 0.38;
  const hr = w * 0.22;
  // Arms
  const lArmX1 = bx;
  const lArmY1 = by + bh * 0.2;
  const lArmX2 = bx - w * 0.24;
  const lArmY2 = by + bh * 0.58;
  const rArmX1 = bx + bw;
  const rArmY1 = by + bh * 0.2;
  const rArmX2 = bx + bw + w * 0.24;
  const rArmY2 = by + bh * 0.58;
  // Legs
  const lLegX = cx - w * 0.14;
  const lLegY1 = by + bh;
  const lLegY2 = cy + h * 0.5;
  const rLegX = cx + w * 0.14;
  const rLegY1 = by + bh;

  return [
    // head
    `M ${hx} ${hy - hr}`,
    `A ${hr} ${hr} 0 1 1 ${hx - 0.01} ${hy - hr}`,
    // body
    `M ${bx + 8} ${by}`,
    `Q ${cx} ${by - 4} ${bx + bw - 8} ${by}`,
    `Q ${bx + bw + 6} ${by} ${bx + bw} ${by + 10}`,
    `L ${bx + bw} ${by + bh - 10}`,
    `Q ${bx + bw} ${by + bh + 6} ${bx + bw - 8} ${by + bh}`,
    `L ${bx + 8} ${by + bh}`,
    `Q ${bx - 6} ${by + bh} ${bx} ${by + bh - 10}`,
    `L ${bx} ${by + 10}`,
    `Q ${bx} ${by} ${bx + 8} ${by}`,
    `Z`,
    // left arm
    `M ${lArmX1} ${lArmY1}`,
    `Q ${lArmX1 - w * 0.18} ${(lArmY1 + lArmY2) / 2} ${lArmX2} ${lArmY2}`,
    `Q ${lArmX2 - 6} ${lArmY2 + 10} ${lArmX2 + 12} ${lArmY2 + 4}`,
    `Q ${lArmX1 - w * 0.10} ${(lArmY1 + lArmY2) / 2 + 10} ${lArmX1 + 8} ${lArmY1 + 6}`,
    `Z`,
    // right arm
    `M ${rArmX1} ${rArmY1}`,
    `Q ${rArmX1 + w * 0.18} ${(rArmY1 + rArmY2) / 2} ${rArmX2} ${rArmY2}`,
    `Q ${rArmX2 + 6} ${rArmY2 + 10} ${rArmX2 - 12} ${rArmY2 + 4}`,
    `Q ${rArmX1 + w * 0.10} ${(rArmY1 + rArmY2) / 2 + 10} ${rArmX1 - 8} ${rArmY1 + 6}`,
    `Z`,
    // left leg
    `M ${lLegX - 8} ${lLegY1}`,
    `L ${lLegX - 12} ${lLegY2}`,
    `L ${lLegX + 4} ${lLegY2}`,
    `L ${lLegX + 8} ${lLegY1 + 4}`,
    `Z`,
    // right leg
    `M ${rLegX - 8} ${rLegY1}`,
    `L ${rLegX - 4} ${lLegY2}`,
    `L ${rLegX + 12} ${lLegY2}`,
    `L ${rLegX + 8} ${rLegY1 + 4}`,
    `Z`,
  ].join(" ");
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KidsShadowStill() {
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [cameraErr, setCameraErr] = useState<string | null>(null);

  // SVG element ref for RAF-driven mutation
  const svgRef = useRef<SVGSVGElement>(null);

  // Per-element refs for fast direct DOM updates
  const echoShadowRef = useRef<SVGGElement>(null);
  const realShadowRef = useRef<SVGGElement>(null);
  const combGroupRef = useRef<SVGGElement>(null);
  const glowCircleRef = useRef<SVGCircleElement>(null);
  const hushLabelRef = useRef<SVGTextElement>(null);
  const demoLabelRef = useRef<SVGTextElement>(null);
  const energyMeterRef = useRef<SVGRectElement>(null);

  // Mutable state (not in React state — updated per frame)
  const visRef = useRef<VisState>({
    energy: 0,
    delayS: 1 / (2 * BASE_FREQ),
    echoOffset: 0,
    combBars: Array(COMB_BARS).fill(0.5),
    demoPhase: 0,
    isDemo: true,
    isHush: false,
    lastRealMotionMs: 0,
  });

  const audioRef = useRef<AudioRig | null>(null);
  const motionRef = useRef<MotionDetector | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const cameraErrReportedRef = useRef(false);

  // ── frame loop ──────────────────────────────────────────────────────────────

  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame);
    const vis = visRef.current;
    const audio = audioRef.current;
    const motion = motionRef.current;
    const rawDt = lastTsRef.current > 0 ? (ts - lastTsRef.current) / 1000 : 0.016;
    const dt = Math.min(rawDt, 0.05); // cap at 50ms
    lastTsRef.current = ts;

    // ── determine energy source ──────────────────────────────────────────────
    const cameraEnergy = motion ? motion.getEnergy() : 0;
    const cameraErrNow = motion ? motion.getCameraError() : null;

    if (cameraErrNow && !cameraErrReportedRef.current) {
      cameraErrReportedRef.current = true;
      setCameraErr(cameraErrNow);
    }

    // detect real motion
    if (cameraEnergy > 0.05) {
      vis.lastRealMotionMs = ts;
      vis.isDemo = false;
    } else if (ts - vis.lastRealMotionMs > IDLE_RESUME_MS) {
      vis.isDemo = true;
    }

    // advance demo phase (dt is in seconds, DEMO_PERIOD_MS in ms)
    if (vis.isDemo) {
      vis.demoPhase = (vis.demoPhase + dt * 1000) % DEMO_PERIOD_MS;
    }

    // compute target energy
    let targetEnergy: number;
    if (vis.isDemo) {
      // Slow sine oscillation: 0 → 1 → 0 with a pause at hush
      const t = vis.demoPhase / DEMO_PERIOD_MS;
      // Spend more time near still (hush):
      // quick ramp up, slow settle down
      const raw = Math.sin(t * Math.PI * 2);
      targetEnergy = clamp((raw + 0.18) * 0.8, 0, 1);
    } else {
      targetEnergy = cameraEnergy;
    }

    // smooth energy
    vis.energy = lerp(vis.energy, targetEnergy, 0.06);

    // ── audio: update delay ──────────────────────────────────────────────────
    const newDelay = energyToDelay(vis.energy);
    vis.delayS = newDelay;
    if (audio) {
      audio.setDelay(newDelay);
    }

    // ── derived visual state ─────────────────────────────────────────────────
    // Echo shadow offset: energy → separation (max ~60 SVG units)
    vis.echoOffset = vis.energy * 65;
    vis.isHush = vis.energy < 0.12;

    // comb bars: compute magnitude response
    for (let i = 0; i < COMB_BARS; i++) {
      const normFreq = (i + 0.5) / COMB_BARS;
      vis.combBars[i] = combMagnitude(normFreq, vis.delayS);
    }

    // ── update SVG elements directly (no React re-render) ───────────────────
    const svg = svgRef.current;
    if (!svg) return;

    // Echo shadow: translate + opacity
    if (echoShadowRef.current) {
      const offsetX = vis.echoOffset * 0.7;
      const offsetY = vis.echoOffset * 0.4;
      const echoOpacity = lerp(0.15, 0.55, vis.energy);
      echoShadowRef.current.setAttribute(
        "transform",
        `translate(${offsetX}, ${offsetY})`
      );
      echoShadowRef.current.style.opacity = String(echoOpacity);
    }

    // Real shadow: slight pulse/tremble when energy is high
    if (realShadowRef.current) {
      const tremble = vis.energy * 2.5;
      const tx = (Math.random() - 0.5) * tremble;
      const ty = (Math.random() - 0.5) * tremble;
      if (vis.energy > 0.15) {
        realShadowRef.current.setAttribute(
          "transform",
          `translate(${tx}, ${ty})`
        );
      } else {
        realShadowRef.current.setAttribute("transform", "translate(0,0)");
      }
    }

    // Comb bars — bars grow upward from y=548, max height 44px
    if (combGroupRef.current) {
      const bars = combGroupRef.current.children;
      for (let i = 0; i < Math.min(bars.length, COMB_BARS); i++) {
        const el = bars[i] as SVGRectElement;
        const mag = vis.combBars[i];
        // Height: notches appear as short bars (deep notch = near zero height)
        const maxH = 44;
        const barH = Math.max(1, mag * maxH);
        const baseY = 548; // bottom anchor
        const hue = lerp(200, 280, vis.energy);
        const lightness = lerp(30, 70, mag);
        const alpha = lerp(0.45, 1.0, vis.energy * 0.5 + 0.5);
        el.setAttribute("height", String(barH));
        el.setAttribute("y", String(baseY - barH));
        el.style.fill = `hsla(${hue},70%,${lightness}%,${alpha})`;
      }
    }

    // Glow circle: bright when moving, dim when still
    if (glowCircleRef.current) {
      const glowR = lerp(30, 120, vis.energy);
      const glowOpacity = lerp(0.05, 0.35, vis.energy);
      glowCircleRef.current.setAttribute("r", String(glowR));
      glowCircleRef.current.style.opacity = String(glowOpacity);
    }

    // Hush label: fades in when near anti-phase
    if (hushLabelRef.current) {
      const hushOpacity = vis.isHush ? clamp((0.12 - vis.energy) / 0.12, 0, 1) : 0;
      hushLabelRef.current.style.opacity = String(hushOpacity);
    }

    // Demo label: show when auto-demo
    if (demoLabelRef.current) {
      demoLabelRef.current.style.opacity = vis.isDemo ? "0.7" : "0";
    }

    // Energy meter bar
    if (energyMeterRef.current) {
      energyMeterRef.current.setAttribute("width", String(vis.energy * 120));
    }
  }, []);

  // ── start handler ────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    // Build audio rig inside user gesture (iOS unlock)
    const audio = buildAudioRig();
    audioRef.current = audio;

    // Start auto-demo immediately
    visRef.current.isDemo = true;
    visRef.current.lastRealMotionMs = 0;

    setPhase("running");

    // Kick off camera (async, may fail gracefully)
    const motion = makeMotionDetector();
    motionRef.current = motion;
    // Don't await — camera starting asynchronously, auto-demo covers the gap
    void motion.start().then(() => {
      const err = motion.getCameraError();
      if (err) setCameraErr(err);
    }).catch(() => {
      setCameraErr("Camera not available — running auto-demo");
    });
  }, []);

  // ── mount/unmount RAF ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;

    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      motionRef.current?.stop();
      audioRef.current?.teardown();
    };
  }, [phase, runFrame]);

  // ─── idle screen ─────────────────────────────────────────────────────────────

  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050816] text-foreground gap-6 px-6 text-center">
        <div className="select-none text-6xl" aria-hidden="true">🌑</div>
        <h1 className="text-3xl font-semibold text-foreground leading-tight">
          Shadow Still
        </h1>
        <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
          Move to wake the sound. Go still — and the sound hollows to a hush.
        </p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          Your shadow and its echo split apart when you wiggle. Hold still and
          they merge — the sound cancels to almost nothing.
        </p>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35
                     border border-violet-400/40 rounded-2xl px-8 py-4
                     text-foreground text-lg font-medium transition-colors
                     active:scale-95"
          onPointerDown={handleStart}
        >
          🌑 Start
        </button>
        <p className="text-sm text-muted-foreground">
          camera optional · for kids 4+
        </p>
        <Link
          href="/dream/513-kids-shadow-still/README.md"
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 mt-2"
        >
          Read the design notes
        </Link>
      </div>
    );
  }

  // ─── running screen ───────────────────────────────────────────────────────────

  // Pre-compute initial combBars for static SVG seed
  const barW = 400 / COMB_BARS;

  return (
    <div className="fixed inset-0 bg-[#050816] flex flex-col overflow-hidden select-none">

      {/* Camera error notice */}
      {cameraErr && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 z-20
                      text-violet-300 text-sm px-4 py-1.5 rounded-full
                      bg-black/60 border border-violet-500/30 max-w-xs text-center
                      pointer-events-none">
          {cameraErr}
        </p>
      )}

      {/* Main SVG — ALL visible rendering happens here */}
      <svg
        ref={svgRef}
        viewBox="0 0 400 560"
        className="w-full h-full"
        style={{ touchAction: "none" }}
        aria-label="Shadow and echo-shadow visualization"
      >
        <defs>
          {/* Shadow gradient — deep translucent blue-black */}
          <radialGradient id="shadowGrad" cx="50%" cy="60%" r="55%">
            <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#050816" stopOpacity="0.85" />
          </radialGradient>

          {/* Echo shadow gradient — lighter, more translucent */}
          <radialGradient id="echoGrad" cx="50%" cy="60%" r="55%">
            <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#050816" stopOpacity="0.2" />
          </radialGradient>

          {/* Wall texture gradient */}
          <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c0f2a" />
            <stop offset="100%" stopColor="#050816" />
          </linearGradient>

          {/* Glow radial */}
          <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="1" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
          </radialGradient>

          {/* Filter: shadow blur */}
          <filter id="shadowBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>

          {/* Filter: echo blur (more) */}
          <filter id="echoBlur" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        {/* Background wall */}
        <rect width="400" height="560" fill="url(#wallGrad)" />

        {/* Floor line */}
        <line
          x1="0" y1="490" x2="400" y2="490"
          stroke="#1e2040" strokeWidth="1" opacity="0.6"
        />

        {/* Ambient glow circle — tracks energy */}
        <circle
          ref={glowCircleRef}
          cx="200" cy="330"
          r="30"
          fill="url(#glowGrad)"
          opacity="0.05"
        />

        {/* ── Echo shadow (rendered first, behind) ──────────────────────── */}
        <g ref={echoShadowRef} style={{ opacity: 0.2 }}>
          <g filter="url(#echoBlur)">
            <path
              d={kidSilhouettePath(200, 310, 130, 240)}
              fill="url(#echoGrad)"
            />
          </g>
        </g>

        {/* ── Real shadow ────────────────────────────────────────────────── */}
        <g ref={realShadowRef}>
          <g filter="url(#shadowBlur)">
            <path
              d={kidSilhouettePath(200, 310, 130, 240)}
              fill="url(#shadowGrad)"
            />
          </g>
        </g>

        {/* ── Floor shadow (small ellipse) ───────────────────────────────── */}
        <ellipse
          cx="200" cy="486" rx="55" ry="8"
          fill="#1e1b4b" opacity="0.4"
        />

        {/* ── Energy meter (top) ─────────────────────────────────────────── */}
        <text
          x="134" y="18"
          textAnchor="end"
          fontFamily="monospace"
          fontSize="8"
          fill="rgba(255,255,255,0.45)"
        >
          motion
        </text>
        {/* Background track */}
        <rect
          x="140" y="11"
          width="120" height="7"
          rx="3.5"
          fill="rgba(255,255,255,0.08)"
        />
        {/* Fill bar */}
        <rect
          ref={energyMeterRef}
          x="140" y="11"
          width="0" height="7"
          rx="3.5"
          fill="rgba(129,140,248,0.75)"
        />

        {/* ── Hush label ─────────────────────────────────────────────────── */}
        <text
          ref={hushLabelRef}
          x="200" y="175"
          textAnchor="middle"
          fontFamily="serif"
          fontSize="22"
          fill="rgba(199,210,254,0.9)"
          style={{ opacity: 0 }}
          letterSpacing="0.12em"
        >
          hush…
        </text>

        {/* ── Comb spectrum strip (bottom 60px of viewBox) ────────────────── */}
        {/* Label above bars */}
        <text
          x="200" y="498"
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="8"
          fill="rgba(255,255,255,0.38)"
          letterSpacing="0.10em"
        >
          COMB SPECTRUM
        </text>

        {/* Bar group — bars mutated each frame via ref.
            Bars anchored at bottom=548, grow upward. */}
        <g ref={combGroupRef}>
          {Array.from({ length: COMB_BARS }, (_, i) => {
            const x = (i / COMB_BARS) * 400;
            return (
              <rect
                key={i}
                x={x}
                y={504}
                width={barW - 1}
                height={44}
                rx="1"
                fill="hsla(230,70%,50%,0.8)"
              />
            );
          })}
        </g>

        {/* ── Auto-demo label ────────────────────────────────────────────── */}
        <text
          ref={demoLabelRef}
          x="200" y="558"
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="8"
          fill="rgba(255,255,255,0.5)"
          letterSpacing="0.06em"
          style={{ opacity: 0.7 }}
        >
          auto-demo · stand in front of camera to take over
        </text>
      </svg>

      {/* Bottom UI overlay — outside SVG for DOM buttons */}
      <div className="absolute bottom-0 left-0 right-0 pb-safe pointer-events-none">
        <div className="flex justify-center pb-3">
          <Link
            href="/dream/513-kids-shadow-still/README.md"
            className="pointer-events-auto text-xs text-muted-foreground hover:text-foreground
                       underline underline-offset-2 transition-colors"
          >
            design notes
          </Link>
        </div>
      </div>
    </div>
  );
}
