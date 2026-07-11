"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

const STEPS = 32; // 2 bars × 16 16th-notes
const LOOKAHEAD = 0.09; // seconds ahead to schedule
const SCHEDULER_MS = 20;

type DrumType = "kick" | "snare" | "hat" | null;
type Phase = "idle" | "tapping" | "playing";

/** Classic 4/4 demo: kick 1+3, snare 2+4, hi-hat on off-beats. */
const DEMO_STEPS: DrumType[] = (() => {
  const s: DrumType[] = Array(STEPS).fill(null);
  s[0] = "kick"; s[16] = "kick";
  s[8] = "snare"; s[24] = "snare";
  s[4] = "hat"; s[12] = "hat"; s[20] = "hat"; s[28] = "hat";
  return s;
})();

/** Drum synthesis — all Web Audio, no deps. */
function triggerDrum(ctx: AudioContext, type: DrumType, when: number): void {
  if (!type) return;
  if (type === "kick") {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(80, when);
    o.frequency.exponentialRampToValueAtTime(36, when + 0.07);
    g.gain.setValueAtTime(0.9, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.38);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(when);
    o.stop(when + 0.4);
    return;
  }
  if (type === "snare") {
    const len = Math.floor(ctx.sampleRate * 0.13);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = "bandpass";
    flt.frequency.value = 2200;
    flt.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
    src.connect(flt);
    flt.connect(g);
    g.connect(ctx.destination);
    src.start(when);
    src.stop(when + 0.14);
    return;
  }
  // hat
  const len = Math.floor(ctx.sampleRate * 0.035);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const flt = ctx.createBiquadFilter();
  flt.type = "highpass";
  flt.frequency.value = 8500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.38, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.03);
  src.connect(flt);
  flt.connect(g);
  g.connect(ctx.destination);
  src.start(when);
  src.stop(when + 0.038);
}

export default function TapRhythm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stepsRef = useRef<DrumType[]>(DEMO_STEPS.slice());
  const bpmRef = useRef(120);
  const currentStepRef = useRef(0);
  const nextStepTimeRef = useRef(0);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drawRafRef = useRef<number>(0);
  const tapTimestampsRef = useRef<number[]>([]);
  const tapDrumRef = useRef<DrumType>("kick");
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashAmtRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  const [phase, setPhase] = useState<Phase>("idle");
  const [bpm, setBpm] = useState(120);
  const [drumTab, setDrumTab] = useState<"kick" | "snare" | "hat">("kick");
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    tapDrumRef.current = drumTab;
  }, [drumTab]);

  const applyPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const startScheduler = useCallback((ctx: AudioContext) => {
    if (schedulerRef.current) clearInterval(schedulerRef.current);
    currentStepRef.current = 0;
    nextStepTimeRef.current = ctx.currentTime + 0.06;
    schedulerRef.current = setInterval(() => {
      const now = ctx.currentTime;
      const stepDur = 60 / bpmRef.current / 4;
      while (nextStepTimeRef.current < now + LOOKAHEAD) {
        const s = currentStepRef.current;
        triggerDrum(ctx, stepsRef.current[s], nextStepTimeRef.current);
        if (stepsRef.current[s]) flashAmtRef.current = 1.0;
        currentStepRef.current = (s + 1) % STEPS;
        nextStepTimeRef.current += stepDur;
      }
    }, SCHEDULER_MS);
  }, []);

  const stopScheduler = useCallback(() => {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  const startDemo = useCallback(() => {
    stepsRef.current = DEMO_STEPS.slice();
    bpmRef.current = 120;
    setBpm(120);
    const ctx = getAudioCtx();
    startScheduler(ctx);
    applyPhase("playing");
  }, [getAudioCtx, startScheduler, applyPhase]);

  /** Quantize collected tap timestamps into the 32-step grid. */
  const finalizeTaps = useCallback(() => {
    const times = tapTimestampsRef.current;
    if (times.length >= 2) {
      // Median inter-onset interval → BPM
      const iois: number[] = [];
      for (let i = 1; i < times.length; i++) {
        const d = times[i] - times[i - 1];
        if (d > 120 && d < 1800) iois.push(d);
      }
      if (iois.length > 0) {
        const sorted = iois.slice().sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        const detected = Math.round(Math.max(60, Math.min(200, 60000 / med)));
        bpmRef.current = detected;
        setBpm(detected);
      }
      // Quantize each tap to the nearest 16th-note slot
      const stepMs = (60000 / bpmRef.current) / 4;
      const cycleMs = stepMs * STEPS;
      const t0 = times[0];
      for (const t of times) {
        const elapsed = ((t - t0) % cycleMs + cycleMs) % cycleMs;
        const slot = Math.round(elapsed / stepMs) % STEPS;
        stepsRef.current[slot] = tapDrumRef.current;
      }
    }
    const ctx = getAudioCtx();
    if (!schedulerRef.current) startScheduler(ctx);
    applyPhase("playing");
  }, [getAudioCtx, startScheduler, applyPhase]);

  const handleTap = useCallback(() => {
    const ctx = getAudioCtx();
    if (phaseRef.current !== "tapping") {
      tapTimestampsRef.current = [];
      applyPhase("tapping");
      setTapCount(0);
    }
    const now = performance.now();
    tapTimestampsRef.current.push(now);
    setTapCount((c) => c + 1);
    triggerDrum(ctx, tapDrumRef.current, ctx.currentTime);
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === "tapping") finalizeTaps();
    }, 2000);
  }, [getAudioCtx, applyPhase, finalizeTaps]);

  // Spacebar → tap
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTap]);

  // Auto-start demo on mount
  useEffect(() => {
    startDemo();
  }, [startDemo]);

  // Click / touch on clock face → toggle step
  const handleCanvasInteraction = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dprLocal = canvas.width / rect.width;
      const x = (clientX - rect.left) * dprLocal;
      const y = (clientY - rect.top) * dprLocal;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const R = Math.min(canvas.width, canvas.height) * 0.38;
      const HIT = R * 0.18;

      let nearest = -1;
      let nearestDist = HIT;
      for (let i = 0; i < STEPS; i++) {
        const angle = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(angle) * R;
        const sy = cy + Math.sin(angle) * R;
        const dist = Math.hypot(x - sx, y - sy);
        if (dist < nearestDist) {
          nearest = i;
          nearestDist = dist;
        }
      }
      if (nearest < 0) return;

      const cycle: DrumType[] = [null, "kick", "snare", "hat"];
      const cur = stepsRef.current[nearest];
      stepsRef.current[nearest] = cycle[(cycle.indexOf(cur) + 1) % cycle.length];

      if (phaseRef.current === "idle") {
        const ctx = getAudioCtx();
        startScheduler(ctx);
        applyPhase("playing");
      }
    },
    [getAudioCtx, startScheduler, applyPhase]
  );

  // Canvas draw loop — reads only refs, no state
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const BEAT_SLOTS = new Set([0, 8, 16, 24]);
    const DRUM_COLORS: Record<string, { fill: string; bright: string }> = {
      kick: { fill: "#6d28d9", bright: "#c4b5fd" },
      snare: { fill: "#b45309", bright: "#fde68a" },
      hat: { fill: "#065f46", bright: "#6ee7b7" },
    };

    const drawFrame = () => {
      flashAmtRef.current *= 0.88;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.38;
      const cur = currentStepRef.current;

      ctx.fillStyle = "#060610";
      ctx.fillRect(0, 0, W, H);

      // Outer ring guide
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Beat-pulse glow at center
      if (BEAT_SLOTS.has(cur) && flashAmtRef.current > 0.15) {
        const pr = Math.min(W, H) * 0.07 * flashAmtRef.current;
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, pr);
        grd.addColorStop(0, `rgba(255,255,255,${0.28 * flashAmtRef.current})`);
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, pr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Step dots
      for (let i = 0; i < STEPS; i++) {
        const angle = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(angle) * R;
        const sy = cy + Math.sin(angle) * R;
        const type = stepsRef.current[i];
        const isActive = i === cur;
        const isBeat = BEAT_SLOTS.has(i);
        const dotR = (isBeat ? 7.5 : 5) * dpr;

        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);

        if (type) {
          const col = DRUM_COLORS[type];
          ctx.fillStyle = isActive ? col.bright : col.fill;
          if (isActive) {
            ctx.shadowBlur = 16 * dpr;
            ctx.shadowColor = col.bright;
          }
        } else {
          ctx.fillStyle = isBeat
            ? "rgba(255,255,255,0.18)"
            : "rgba(255,255,255,0.07)";
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Clock hand
      if (phaseRef.current !== "idle") {
        const angle = (cur / STEPS) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * R * 0.72, cy + Math.sin(angle) * R * 0.72);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawRafRef.current = requestAnimationFrame(drawFrame);
    };
    drawRafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(drawRafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // reads refs only

  // Cleanup
  useEffect(() => {
    return () => {
      stopScheduler();
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      cancelAnimationFrame(drawRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopScheduler]);

  const handleBpmChange = (val: number) => {
    bpmRef.current = val;
    setBpm(val);
  };

  const clearDrumType = () => {
    stepsRef.current = stepsRef.current.map((s) => (s === drumTab ? null : s));
  };

  const clearAll = () => {
    stepsRef.current = Array(STEPS).fill(null);
  };

  const drumLabel: Record<string, string> = {
    kick: "◉ Kick",
    snare: "● Snare",
    hat: "· Hat",
  };
  const drumColors: Record<string, string> = {
    kick: "bg-violet-500/20 border-violet-400 text-violet-300",
    snare: "bg-violet-500/20 border-violet-400 text-violet-300",
    hat: "bg-violet-500/20 border-violet-400 text-violet-300",
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#060610] px-4 pt-5 pb-8 gap-5">
      {/* Header */}
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-mono tracking-tight text-foreground">
          Tap Rhythm
        </h1>
        <p className="text-base text-muted-foreground mt-1 leading-snug">
          Tap a groove — it auto-detects tempo, quantizes, and loops.
          Click the ring to edit individual steps.
        </p>
      </div>

      {/* Clock face canvas */}
      <canvas
        ref={canvasRef}
        className="w-full max-w-md rounded-xl cursor-pointer"
        style={{ aspectRatio: "1 / 1", background: "#060610" }}
        onClick={(e) => handleCanvasInteraction(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          e.preventDefault();
          if (e.touches.length > 0) {
            handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
      />

      {/* Controls */}
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* Drum type selector */}
        <div className="flex gap-2">
          {(["kick", "snare", "hat"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDrumTab(d)}
              className={`flex-1 py-2.5 text-sm font-mono tracking-wide rounded border transition min-h-[44px] ${
                drumTab === d
                  ? drumColors[d]
                  : "border-border text-muted-foreground hover:border-border hover:text-muted-foreground"
              }`}
            >
              {drumLabel[d]}
            </button>
          ))}
        </div>

        {/* TAP button */}
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            handleTap();
          }}
          className="w-full py-5 text-xl font-mono tracking-[0.3em] uppercase border-2 border-border rounded-xl hover:border-border hover:bg-accent active:bg-muted transition text-foreground select-none min-h-[64px]"
        >
          {phase === "tapping" ? `TAP  ×${tapCount}` : "TAP"}
        </button>

        {/* Status */}
        <p className="text-sm text-muted-foreground text-center min-h-[1.25rem]">
          {phase === "idle" &&
            "Click a ring dot or tap to start · spacebar also works"}
          {phase === "tapping" &&
            `Tapping ${drumTab}s — pause 2 s to capture`}
          {phase === "playing" &&
            "Looping · click ring to edit · tap to add more"}
        </p>

        {/* BPM */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono">BPM</span>
          <input
            type="range"
            min={60}
            max={200}
            step={1}
            value={bpm}
            onChange={(e) => handleBpmChange(parseInt(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm text-foreground font-mono w-10 text-right">
            {bpm}
          </span>
        </div>

        {/* Action row */}
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={startDemo}
            className="px-4 py-2.5 text-sm font-mono border border-border rounded hover:border-border text-muted-foreground hover:text-foreground transition min-h-[44px]"
          >
            Demo
          </button>
          <button
            onClick={clearDrumType}
            className="px-4 py-2.5 text-sm font-mono border border-border rounded hover:border-border text-muted-foreground hover:text-foreground transition min-h-[44px]"
          >
            Clear {drumTab}
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2.5 text-sm font-mono border border-border rounded hover:border-border text-muted-foreground hover:text-foreground transition min-h-[44px]"
          >
            Clear all
          </button>
          <Link
            href="/dream"
            className="ml-auto text-xs text-muted-foreground/70 hover:text-muted-foreground transition"
          >
            ← dream lab
          </Link>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs font-mono text-muted-foreground/70 pt-1">
          <span>
            <span className="text-violet-400">◉</span> kick
          </span>
          <span>
            <span className="text-violet-400">●</span> snare
          </span>
          <span>
            <span className="text-violet-400">·</span> hi-hat
          </span>
          <span className="ml-auto">32 steps · 2 bars</span>
        </div>
      </div>

      <Link
        href="/dream/161-tap-rhythm/readme"
        className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition"
      >
        design notes →
      </Link>
    </div>
  );
}
