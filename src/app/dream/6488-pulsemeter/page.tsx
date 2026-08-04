"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
// Pulsemeter (6488)
//
// THE ONE QUESTION: "What if Resonance could let you HEAR the health of your own
// machine — a live, generative soundscape and visual that IS your browser's
// real-time performance telemetry, so a smooth 60fps feels like a calm drone
// and a jank spike rings like a struck bell?"
//
// A real-world-data SONIFICATION where the data source is the visitor's own
// computer, in real time. Not self-playing: it is driven by genuine live machine
// state (frame cadence, main-thread jank, memory pressure, event activity) plus
// how the visitor chooses to exercise the machine.
//
//   INPUT      = live system telemetry via the browser Performance APIs
//                (requestAnimationFrame delta timing, PerformanceObserver for
//                longtask / event entries, performance.memory where available).
//   OUTPUT     = pure Canvas2D — an ECG/seismograph readout with a soft radial
//                "breathing" field whose calm/agitation tracks running FPS.
//   TECHNIQUE  = continuous data → generative Web Audio synthesis: a calm
//                just-intonation drone for smooth frames, subtle vibrato from
//                jitter, a struck resonant bell on each jank spike, and a slow
//                darkening detune under memory pressure.
//
// Research anchor: "Real-time, EDM-inspired sonification of the activity of a
// supercomputer," arXiv:2605.21874 (2026) — sonifying a live running computing
// system as continuous, embodied monitoring you listen to. This piece brings
// that idea home to the visitor's own browser.
// ════════════════════════════════════════════════════════════════════════════

// ── Seeded PRNG (mulberry32) — NO Math.random anywhere (determinism rule) ──────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Target frame budget for 60fps.
const FRAME_TARGET = 1000 / 60;

// Just-intonation ratios for the drone partials (consonant, warm).
const DRONE_RATIOS = [1, 5 / 4, 3 / 2, 2];
// Just-intonation lattice a struck bell's fundamental snaps to; severe jank
// snaps low & resonant, mild jank rings high & bright.
const BELL_RATIOS = [1, 6 / 5, 4 / 3, 3 / 2, 15 / 8, 2];
const BELL_BASE = 262; // Hz (~C4)
const DRONE_BASE = 98; // Hz (~G2)
const BELL_CAP = 6; // max simultaneous bell voices

// ── Telemetry snapshot the visual + audio both read each frame ─────────────────
interface Telemetry {
  fps: number; // smoothed frames/sec
  frameMs: number; // last frame interval
  jitter: number; // 0..1 normalized frame-to-frame instability
  pressure: number; // 0..1 memory pressure (or synthetic LFO)
  activity: number; // 0..1 decaying event/paint activity texture
  spikeGlow: number; // 0..1 decaying visual flash from recent jank
  // internals for the seismograph trace
  spikeEnv: number;
  spikePhase: number;
  prevFrameMs: number;
  jitterAcc: number;
  breath: number;
}

interface SupportFlags {
  longtask: boolean;
  memory: boolean;
  eventTiming: boolean;
}

// ── The generative Web Audio engine (built on the Start gesture) ───────────────
interface AudioEngine {
  update: (t: Telemetry, now: number) => void;
  strike: (severity: number) => void;
  dispose: () => void;
}

function makeAudioEngine(ctx: AudioContext, rng: () => number): AudioEngine {
  const now0 = ctx.currentTime;

  // Master chain: everything → compressor (soft limiter) → destination.
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);

  // ── Drone: consonant just-intonation partials through a lowpass we darken ──
  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0.0001, now0);
  droneGain.gain.exponentialRampToValueAtTime(0.16, now0 + 2.2); // gentle fade-in
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 900;
  droneFilter.Q.value = 0.6;
  droneFilter.connect(droneGain).connect(master);

  // Shared vibrato LFO whose depth (cents) we drive from frame jitter.
  const vibLfo = ctx.createOscillator();
  vibLfo.type = "sine";
  vibLfo.frequency.value = 5.5;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = 0; // cents, set per-frame
  vibLfo.connect(vibDepth);
  vibLfo.start();

  const droneOscs: OscillatorNode[] = [];
  DRONE_RATIOS.forEach((ratio, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "sine" : "triangle";
    o.frequency.value = DRONE_BASE * ratio;
    o.detune.value = (rng() - 0.5) * 6; // tiny static spread for warmth
    const g = ctx.createGain();
    g.gain.value = 0.5 / (i + 1); // upper partials quieter
    vibDepth.connect(o.detune);
    o.connect(g).connect(droneFilter);
    o.start();
    droneOscs.push(o);
  });

  // Bell voices share a bus so the limiter always sees them.
  const bellBus = ctx.createGain();
  bellBus.gain.value = 0.9;
  bellBus.connect(master);

  const live = new Set<AudioNode>();
  let activeBells = 0;

  const strike = (severity: number) => {
    if (activeBells >= BELL_CAP) return; // cap polyphony — never clip
    const s = clamp(severity, 0, 1);
    const t = ctx.currentTime;
    // Severe jank → lower, longer, more resonant; mild → high & bright.
    const idx = Math.round((1 - s) * (BELL_RATIOS.length - 1));
    const fund = BELL_BASE * BELL_RATIOS[idx];
    const dur = 1.1 + s * 2.6;
    const peak = 0.1 + s * 0.16;

    const vGain = ctx.createGain();
    vGain.gain.setValueAtTime(0.0001, t);
    vGain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    vGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    vGain.connect(bellBus);
    live.add(vGain);

    // Inharmonic metallic partials for a struck-bell timbre.
    const partials: Array<[number, number]> = [
      [1, 1],
      [2.01, 0.5],
      [2.99, 0.34],
      [4.17, 0.2],
      [5.43, 0.12],
    ];
    const voiceOscs: OscillatorNode[] = [];
    partials.forEach(([ratio, pg]) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = fund * ratio * (1 + (rng() - 0.5) * 0.004);
      const g = ctx.createGain();
      g.gain.value = pg;
      o.connect(g).connect(vGain);
      o.start(t);
      o.stop(t + dur + 0.1);
      live.add(o);
      live.add(g);
      voiceOscs.push(o);
    });

    activeBells++;
    voiceOscs[0].onended = () => {
      activeBells = Math.max(0, activeBells - 1);
      voiceOscs.forEach((o) => live.delete(o));
      live.delete(vGain);
    };
  };

  const update = (t: Telemetry) => {
    const now = ctx.currentTime;
    // Smoothness: 1 at calm 60fps, 0 when struggling.
    const smooth = clamp(t.fps / 60, 0, 1);
    const agitation = 1 - smooth;

    // Memory pressure + jank darken the drone (lower cutoff).
    const cutoff = 400 + smooth * 900 - t.pressure * 320;
    droneFilter.frequency.setTargetAtTime(clamp(cutoff, 180, 1400), now, 0.25);

    // Pressure pulls the whole drone slightly flat (a darkening detune).
    const detune = -t.pressure * 22 - agitation * 8;
    droneOscs.forEach((o) =>
      o.detune.setTargetAtTime(detune, now, 0.3),
    );

    // Jitter → vibrato depth in cents (subtle, never seasick).
    vibDepth.gain.setTargetAtTime(t.jitter * 18 + agitation * 6, now, 0.2);
  };

  const dispose = () => {
    try {
      vibLfo.stop();
    } catch {
      /* already stopped */
    }
    droneOscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* noop */
      }
    });
    live.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    });
    live.clear();
    try {
      vibLfo.disconnect();
      vibDepth.disconnect();
      droneFilter.disconnect();
      droneGain.disconnect();
      bellBus.disconnect();
      master.disconnect();
      limiter.disconnect();
    } catch {
      /* noop */
    }
  };

  return { update, strike, dispose };
}

// ════════════════════════════════════════════════════════════════════════════
// VISUAL — pure Canvas2D. A living ECG/seismograph baseline + a soft radial
// breathing field. Beautiful and legible as a still frame; no strobe/flicker.
// ════════════════════════════════════════════════════════════════════════════
function drawScene(
  cx: CanvasRenderingContext2D,
  w: number,
  h: number,
  trace: number[],
  t: Telemetry,
  now: number,
  motion: number, // 0..1 global motion damping (prefers-reduced-motion)
) {
  const cxr = w / 2;
  const cyr = h / 2;
  const smooth = clamp(t.fps / 60, 0, 1);
  const agitation = 1 - smooth;

  // Motion-blur wash instead of a hard clear — soft trails, no flicker.
  cx.fillStyle = "rgba(8, 6, 16, 0.14)";
  cx.fillRect(0, 0, w, h);

  // ── Radial "breathing" field: calm slow bloom at 60fps, tighter/faster when
  // agitated. Violet family; a jank spike warms it briefly toward red. ──
  const breathHz = lerp(0.16, 0.5, agitation);
  const breath = 0.5 + 0.5 * Math.sin(now * 0.001 * Math.PI * 2 * breathHz);
  const maxR = Math.hypot(w, h) * 0.55;
  const warm = t.spikeGlow; // 0..1
  const rings = 5;
  for (let i = rings; i >= 1; i--) {
    const f = i / rings;
    const wobble = (0.06 + agitation * 0.14) * motion * Math.sin(breath * 6 + i);
    const r = maxR * f * (0.7 + breath * 0.3 * motion + wobble);
    const alpha = (0.05 + smooth * 0.05) * (1 - f) + 0.015;
    const hueR = Math.round(lerp(150, 210, warm)); // violet → warmer on jank
    const hueG = Math.round(lerp(120, 70, warm));
    const hueB = Math.round(lerp(230, 140, warm));
    const grad = cx.createRadialGradient(cxr, cyr, r * 0.2, cxr, cyr, r);
    grad.addColorStop(0, `rgba(${hueR},${hueG},${hueB},${alpha})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = grad;
    cx.beginPath();
    cx.arc(cxr, cyr, r, 0, Math.PI * 2);
    cx.fill();
  }

  // A soft pulsing core "heart" whose brightness follows FPS smoothness.
  const coreR = 14 + breath * 8 * motion + t.activity * 20;
  const coreGrad = cx.createRadialGradient(cxr, cyr, 0, cxr, cyr, coreR + 40);
  const coreA = 0.18 + smooth * 0.22 + t.spikeGlow * 0.3;
  coreGrad.addColorStop(0, `rgba(${180 + warm * 40},${120},${240},${coreA})`);
  coreGrad.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = coreGrad;
  cx.beginPath();
  cx.arc(cxr, cyr, coreR + 40, 0, Math.PI * 2);
  cx.fill();

  // ── Seismograph / ECG trace across the middle. Newest sample at the right. ──
  const n = trace.length;
  if (n > 1) {
    const midY = cyr;
    const amp = h * 0.28;
    // Glow underlay.
    cx.lineJoin = "round";
    cx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      cx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = midY - trace[i] * amp;
        if (i === 0) cx.moveTo(x, y);
        else cx.lineTo(x, y);
      }
      if (pass === 0) {
        // Wide soft glow, tinted red under active jank.
        cx.strokeStyle = `rgba(${170 + warm * 70},${110 - warm * 40},${240 - warm * 90},0.18)`;
        cx.lineWidth = 7;
      } else {
        cx.strokeStyle = `rgba(${210 + warm * 45},${180 - warm * 90},${255 - warm * 90},0.9)`;
        cx.lineWidth = 1.6;
      }
      cx.stroke();
    }
  }

  // Baseline guide line (still-frame legibility).
  cx.strokeStyle = "rgba(140,120,220,0.12)";
  cx.lineWidth = 1;
  cx.beginPath();
  cx.moveTo(0, cyr);
  cx.lineTo(w, cyr);
  cx.stroke();
}

// ════════════════════════════════════════════════════════════════════════════
export default function PulsemeterPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const teleRef = useRef<Telemetry>({
    fps: 60,
    frameMs: FRAME_TARGET,
    jitter: 0,
    pressure: 0.3,
    activity: 0,
    spikeGlow: 0,
    spikeEnv: 0,
    spikePhase: 0,
    prevFrameMs: FRAME_TARGET,
    jitterAcc: 0,
    breath: 0,
  });
  const traceRef = useRef<number[]>([]);
  const observersRef = useRef<PerformanceObserver[]>([]);

  const [audioOn, setAudioOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [support, setSupport] = useState<SupportFlags>({
    longtask: false,
    memory: false,
    eventTiming: false,
  });
  const [readout, setReadout] = useState({ fps: 60, pressure: 0.3, jank: 0 });

  // Register a jank event: rings a bell (if audio on) + kicks the visual spike.
  const registerJank = useCallback((severity: number) => {
    const t = teleRef.current;
    const s = clamp(severity, 0.05, 1);
    t.spikeEnv = Math.max(t.spikeEnv, s);
    t.spikePhase = 0;
    t.spikeGlow = Math.max(t.spikeGlow, s);
    audioRef.current?.strike(s);
  }, []);

  // ── Telemetry + visual loop. ALIVE ON LOAD — no gesture, no permission. ──────
  useEffect(() => {
    const rng = makeRng(0x6488);
    const TRACE_N = 460;
    let mounted = true;

    // One-time capability probe (degrade gracefully).
    const supportedTypes: string[] =
      (
        typeof PerformanceObserver !== "undefined" &&
        (PerformanceObserver as unknown as { supportedEntryTypes?: string[] })
          .supportedEntryTypes
      ) || [];
    const hasLongtask = supportedTypes.includes("longtask");
    const hasEvent = supportedTypes.includes("event");
    const hasMemory =
      typeof performance !== "undefined" &&
      typeof (performance as unknown as { memory?: { usedJSHeapSize: number } })
        .memory !== "undefined";
    setSupport({ longtask: hasLongtask, memory: hasMemory, eventTiming: hasEvent });

    // Longtask observer → precise "struck bell" events.
    if (hasLongtask) {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const sev = clamp((entry.duration - 50) / 220, 0.08, 1);
            registerJank(sev);
          }
        });
        obs.observe({ entryTypes: ["longtask"] });
        observersRef.current.push(obs);
      } catch {
        /* unsupported at runtime — rAF fallback handles jank */
      }
    }

    // Event-timing observer → activity texture (decays in the loop).
    if (hasEvent) {
      try {
        const obs = new PerformanceObserver((list) => {
          const t = teleRef.current;
          const bump = Math.min(0.5, list.getEntries().length * 0.12);
          t.activity = clamp(t.activity + bump, 0, 1);
        });
        // durationThreshold keeps the callback cheap.
        obs.observe({
          type: "event",
          buffered: false,
          durationThreshold: 16,
        } as PerformanceObserverInit);
        observersRef.current.push(obs);
      } catch {
        /* fall back to rAF-jitter-derived activity */
      }
    }

    let lastT = performance.now();
    let lastReadout = lastT;

    const memRef = performance as unknown as {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    };

    const loop = (nowT: number) => {
      if (!mounted) return;
      const t = teleRef.current;
      const dt = Math.max(0.5, nowT - lastT);
      lastT = nowT;

      // Frame cadence → smoothed FPS.
      t.frameMs = dt;
      const instFps = clamp(1000 / dt, 1, 120);
      t.fps = lerp(t.fps, instFps, 0.09);

      // Jitter: smoothed |Δ frame interval|, normalized against the budget.
      const dj = Math.abs(dt - t.prevFrameMs);
      t.jitterAcc = lerp(t.jitterAcc, dj, 0.12);
      t.jitter = clamp(t.jitterAcc / (FRAME_TARGET * 1.5), 0, 1);
      t.prevFrameMs = dt;

      // Memory pressure (Chromium) OR synthetic slow LFO fallback.
      if (hasMemory && memRef.memory && memRef.memory.jsHeapSizeLimit > 0) {
        t.pressure = clamp(
          memRef.memory.usedJSHeapSize / memRef.memory.jsHeapSizeLimit,
          0,
          1,
        );
      } else {
        // Gentle synthetic pressure so the drone still breathes.
        t.pressure = 0.35 + 0.22 * Math.sin(nowT * 0.00006);
      }

      // rAF-derived jank fallback when longtask is unsupported.
      if (!hasLongtask && dt > 55) {
        registerJank(clamp((dt - 50) / 240, 0.08, 1));
      }
      // Derive a little activity from jitter when event timing is unsupported.
      if (!hasEvent) {
        t.activity = clamp(t.activity + t.jitter * 0.08, 0, 1);
      }
      t.activity *= 0.94; // decay
      t.spikeGlow *= 0.9; // decay visual warmth

      // Advance the seismograph trace one sample.
      const agitation = 1 - clamp(t.fps / 60, 0, 1);
      t.breath += 0.02;
      const calm =
        Math.sin(t.breath * 1.7) * 0.03 +
        (rng() - 0.5) * (0.01 + agitation * 0.06); // baseline micro-tremor
      t.spikePhase += 0.72;
      const ring = t.spikeEnv * Math.sin(t.spikePhase) * Math.exp(-t.spikePhase * 0.02);
      t.spikeEnv *= 0.9; // damped ring-down (ECG-like)
      const sample = clamp(calm + ring, -1.4, 1.4);
      const trace = traceRef.current;
      trace.push(sample);
      if (trace.length > TRACE_N) trace.shift();

      // Feed the live audio params.
      audioRef.current?.update(t, nowT);

      // Draw.
      const canvas = canvasRef.current;
      const ctx2d = canvas?.getContext("2d");
      if (canvas && ctx2d) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        const needW = Math.max(1, Math.floor(cssW * dpr));
        const needH = Math.max(1, Math.floor(cssH * dpr));
        if (canvas.width !== needW || canvas.height !== needH) {
          canvas.width = needW;
          canvas.height = needH;
        }
        ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        const motion = prefersReducedMotion ? 0.35 : 1;
        drawScene(ctx2d, cssW, cssH, trace, t, nowT, motion);
      }

      // Throttled UI readout (avoid per-frame React re-render).
      if (nowT - lastReadout > 450) {
        lastReadout = nowT;
        setReadout({
          fps: Math.round(t.fps),
          pressure: t.pressure,
          jank: t.spikeGlow,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      observersRef.current.forEach((o) => {
        try {
          o.disconnect();
        } catch {
          /* noop */
        }
      });
      observersRef.current = [];
    };
  }, [registerJank]);

  // ── Start audio on the user gesture (browsers block autoplay). ──────────────
  const startAudio = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();
      audioCtxRef.current = ctx;
      audioRef.current = makeAudioEngine(ctx, makeRng(0x6488 ^ 0x9e37));
      setAudioOn(true);
    } catch {
      /* audio unavailable — visual keeps running silently */
    }
  }, []);

  // Tear down audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          /* noop */
        });
      }
      audioCtxRef.current = null;
    };
  }, []);

  // ── "Stress the machine": ~120ms busy loop → a real, felt jank spike. ───────
  const stressMachine = useCallback(() => {
    const t0 = performance.now();
    let acc = 0;
    // Deliberate synchronous main-thread block so the visitor CAUSES the bell.
    while (performance.now() - t0 < 120) {
      acc += Math.sqrt(acc + 1.2345) * Math.sin(acc);
    }
    // If longtask observation isn't available, ensure the bell still rings.
    if (!support.longtask) registerJank(0.85);
    // Reference acc so the loop can't be optimized away.
    if (acc === Infinity) console.log(acc);
  }, [support.longtask, registerJank]);

  const missing: string[] = [];
  if (!support.longtask) missing.push("longtask timing");
  if (!support.memory) missing.push("memory pressure");
  if (!support.eventTiming) missing.push("event timing");

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Live canvas fills the viewport — alive from load, silent until Start. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Top hero / controls. */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-8">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · Dream Lab · 6488
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Pulsemeter
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Hear the health of your own machine. This soundscape and readout{" "}
            <span className="text-foreground">is</span> your browser&apos;s live
            performance telemetry — a smooth 60fps settles into a calm drone; a
            jank spike rings like a struck bell.
          </p>

          <div className="pointer-events-auto mt-5 flex flex-wrap items-center gap-3">
            {!audioOn ? (
              <button
                type="button"
                onClick={startAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start listening
              </button>
            ) : (
              <span className="min-h-[44px] inline-flex items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
                Listening — sonifying live telemetry
              </span>
            )}
            <button
              type="button"
              onClick={stressMachine}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stress the machine
            </button>
          </div>
        </header>

        {/* Bottom-left live readout + missing-source note. */}
        <div className="pointer-events-none flex items-end justify-between gap-4">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <div>
              fps{" "}
              <span className="text-foreground">
                {String(readout.fps).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-1">
              mem load{" "}
              <span className="text-foreground">
                {Math.round(readout.pressure * 100)}%
              </span>
            </div>
            <div className="mt-1">
              jank{" "}
              <span
                className={
                  readout.jank > 0.3 ? "text-destructive" : "text-foreground"
                }
              >
                {readout.jank > 0.3 ? "ringing" : "quiet"}
              </span>
            </div>
            {missing.length > 0 && (
              <div className="mt-3 max-w-xs normal-case tracking-normal text-muted-foreground/80">
                Note: {missing.join(", ")} unavailable in this browser —
                using synthetic proxies.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>
      </div>

      {/* Design notes overlay. */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Pulsemeter sonifies the visitor&apos;s own computer in real
                time. The spine is <span className="text-foreground">
                requestAnimationFrame</span> delta timing — every frame&apos;s
                interval becomes instantaneous FPS and jitter, always available
                with zero permission.
              </p>
              <p>
                A <span className="text-foreground">PerformanceObserver</span>{" "}
                for <span className="text-foreground">longtask</span> entries
                catches main-thread blocks over 50ms — these are the struck
                bells, pitched by severity. Event-timing entries add an activity
                texture, and <span className="text-foreground">
                performance.memory</span> (Chromium only) drives a slow
                darkening detune as heap pressure rises. Where a source is
                missing, a synthetic proxy stands in.
              </p>
              <p>
                Sound is continuous data → generative Web Audio: steady high FPS
                → a calm just-intonation drone; frame jitter → subtle vibrato; a
                jank spike → a struck resonant bell; memory pressure → a slow
                detune and lowpass darkening. The visual is pure Canvas2D — an
                ECG/seismograph trace that rings on jank, over a radial
                breathing field whose calm tracks FPS.
              </p>
              <p>
                Research anchor:{" "}
                <span className="text-foreground">
                  &quot;Real-time, EDM-inspired sonification of the activity of a
                  supercomputer,&quot; arXiv:2605.21874 (2026)
                </span>{" "}
                — sonifying a live running computing system as embodied
                monitoring you listen to. In the auditory-display tradition of
                Gaver&apos;s &quot;auditory icons,&quot; Pulsemeter brings that
                home to your browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
