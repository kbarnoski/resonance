"use client";

// ════════════════════════════════════════════════════════════════════════════
//  2688 · ORRERY OF RESONANCES
//  Play music by swinging your phone. Motion pumps energy into a little
//  gravitational system; its orbits fall into small-integer PERIOD ratios
//  (mean-motion resonance, à la the Laplace resonance Io–Europa–Ganymede 4:2:1)
//  and those ratios ARE the intervals you hear. Consonance emerges from the
//  physics; destabilise the orbits and the pitches drift microtonal.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { OrreryEngine, mulberry32 } from "./engine";
import { OrreryAudio } from "./audio";

const BODY_COUNT = 4;
const BASE_HZ = 110; // outermost body = tonic drone (A2)
const SEED = 0x2688;

type MotionState = "idle" | "running";
type Sensor = "unknown" | "motion" | "pointer";

export default function OrreryPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<OrreryEngine | null>(null);
  const audioRef = useRef<OrreryAudio | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // live input vector (sim-space energy) + jerk burst, written by handlers
  const swingRef = useRef({ x: 0, y: 0, burst: 0 });
  const prevAccRef = useRef({ x: 0, y: 0, t: 0 });
  const pointerRef = useRef({ x: 0, y: 0, t: 0, active: false });
  const autopilotRef = useRef(true);
  const apRng = useRef(mulberry32(SEED ^ 0x9e37));

  const [state, setState] = useState<MotionState>("idle");
  const [sensor, setSensor] = useState<Sensor>("unknown");
  const [notice, setNotice] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [interval, setIntervalLabel] = useState<string>("—");

  // ── seed the engine immediately so the canvas is alive before Start ──
  useEffect(() => {
    engineRef.current = new OrreryEngine(SEED, BODY_COUNT);
  }, []);

  // ── canvas sizing (devicePixelRatio-aware) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── DeviceMotion handler ──
  const onMotion = useCallback((e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x == null || a.y == null) return;
    const now = performance.now();
    const prev = prevAccRef.current;
    const dt = Math.max(1e-3, (now - prev.t) / 1000);
    // jerk = |da/dt| → the "whip" of the swing = a burst of energy
    const jerk =
      Math.hypot((a.x - prev.x) / dt, (a.y - prev.y) / dt) / 60;
    prevAccRef.current = { x: a.x, y: a.y, t: now };
    autopilotRef.current = false;
    // map device accel (m/s²) into sim-space energy vector
    swingRef.current.x = (a.x || 0) * 0.03;
    swingRef.current.y = (-(a.y || 0)) * 0.03;
    swingRef.current.burst = Math.min(1.2, jerk * 0.5);
  }, []);

  // ── pointer fallback: velocity = swing energy ──
  const onPointerMove = useCallback((e: PointerEvent) => {
    const now = performance.now();
    const p = pointerRef.current;
    if (p.active) {
      const dt = Math.max(1e-3, (now - p.t) / 1000);
      const vx = (e.clientX - p.x) / dt;
      const vy = (e.clientY - p.y) / dt;
      const speed = Math.hypot(vx, vy);
      autopilotRef.current = false;
      swingRef.current.x = (vx / window.innerWidth) * 0.5;
      swingRef.current.y = (vy / window.innerHeight) * 0.5;
      swingRef.current.burst = Math.min(1.2, (speed / 4000) * 1.0);
    }
    pointerRef.current = { x: e.clientX, y: e.clientY, t: now, active: p.active };
  }, []);

  const onPointerDown = useCallback((e: PointerEvent) => {
    pointerRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      active: true,
    };
    autopilotRef.current = false;
  }, []);
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── main render + sim loop ──
  const loop = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(loop);
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const last = lastTsRef.current || ts;
    const dt = (ts - last) / 1000;
    lastTsRef.current = ts;

    // ── input → engine ──
    if (autopilotRef.current) {
      // seeded idle autopilot: slow breathing swings that push the system
      // toward and away from resonance so it self-demos with zero interaction.
      const t = ts / 1000;
      const a = apRng.current();
      const ex = Math.sin(t * 0.31) * 0.02 + (a - 0.5) * 0.006;
      const ey = Math.cos(t * 0.23) * 0.02;
      const burst = Math.max(0, Math.sin(t * 0.11)) * 0.05;
      engine.inject(ex, ey, burst);
    } else {
      const s = swingRef.current;
      engine.inject(s.x, s.y, s.burst);
      // decay held swing so a paused hand settles back into resonance
      s.x *= 0.9;
      s.y *= 0.9;
      s.burst = 0;
    }

    engine.advance(dt);

    // ── audio ──
    const audio = audioRef.current;
    if (audio && audio.ctx) {
      const freqs = engine.frequencies(BASE_HZ);
      const speeds = engine.bodies.map((b) => {
        const v = Math.hypot(b.vx, b.vy);
        const vc = Math.sqrt(1 / Math.max(0.05, b.a));
        return Math.min(1, v / (vc * 1.6));
      });
      const pans = engine.bodies.map((b) => Math.max(-1, Math.min(1, b.x / 0.6)));
      const lockGain = engine.bodies.map((b, i) => {
        let g = 0;
        for (const lk of engine.locks) {
          if (lk.inner === i || lk.outer === i) g = Math.max(g, lk.strength);
        }
        return g;
      });
      audio.update(freqs, speeds, pans, lockGain, engine.temperature);
    }

    // ── label ──
    if (engine.locks.length) {
      const best = engine.locks.reduce((m, l) =>
        l.strength > m.strength ? l : m,
      );
      setIntervalLabel(`${best.ratio.p}:${best.ratio.q} · ${best.ratio.name}`);
    } else {
      setIntervalLabel("drifting · microtonal");
    }

    draw(ctx, canvas, engine, ts);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  // ── Start: unlock audio + request motion permission (must be user gesture) ──
  const handleStart = useCallback(async () => {
    // audio
    if (!audioRef.current) {
      const audio = new OrreryAudio();
      try {
        await audio.start(BODY_COUNT);
        audioRef.current = audio;
      } catch {
        setNotice("Audio could not start on this device.");
      }
    }

    // motion permission (iOS 13+ gates behind requestPermission)
    let motionOk = false;
    const DME = window.DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<PermissionState>;
    };
    if (typeof DME?.requestPermission === "function") {
      try {
        const res = await DME.requestPermission();
        motionOk = res === "granted";
        if (!motionOk)
          setNotice("Motion access denied — drag the canvas to swing instead.");
      } catch {
        setNotice("Motion access unavailable — drag the canvas to swing instead.");
      }
    } else if ("DeviceMotionEvent" in window) {
      motionOk = true;
    }

    if (motionOk) {
      window.addEventListener("devicemotion", onMotion);
      setSensor("motion");
    } else {
      setSensor("pointer");
      if (!notice)
        setNotice("No motion sensor here — drag the canvas; autopilot runs on idle.");
    }

    // pointer fallback always on (works alongside motion + drives autopilot off)
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }

    setState("running");
  }, [onMotion, onPointerDown, onPointerMove, onPointerUp, notice]);

  // ── teardown ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const raf = rafRef;
    const audio = audioRef;
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (canvas) canvas.removeEventListener("pointerdown", onPointerDown);
      audio.current?.stop();
      audio.current = null;
      cancelAnimationFrame(raf.current);
    };
  }, [onMotion, onPointerDown, onPointerMove, onPointerUp]);

  return (
    <div className="relative flex min-h-dvh w-full flex-col bg-background text-foreground">
      {/* canvas art layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-hidden
      />

      {/* top chrome */}
      <header className="relative z-10 flex items-start justify-between gap-4 p-5 sm:p-8">
        <div className="max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 2688
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Orrery of Resonances
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Swing your phone to pump energy into a tiny gravitational system. Its
            orbits lock into small-integer period ratios — and those ratios become
            the intervals you hear.
          </p>
        </div>
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </header>

      {/* bottom chrome */}
      <div className="relative z-10 mt-auto flex flex-col gap-4 p-5 sm:p-8">
        {notice && (
          <p className="text-sm leading-relaxed text-muted-foreground">{notice}</p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          {state === "idle" ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start · unlock sound & motion
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {sensor === "motion" ? "Swing" : "Drag"} · interval
              </span>
              <span className="text-base tabular-nums text-foreground">
                {interval}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Resonance you can hear
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Four bodies orbit a central star. Each body&apos;s orbital
                frequency (its mean motion, <span className="italic">n</span>) is
                read straight out into a sustained oscillator — pitch is a
                consequence of the dynamics, never snapped to a scale.
              </p>
              <p>
                When two adjacent orbits drift near a small-integer period ratio
                (2:1, 3:2, 4:3 …), a gentle capture force nudges them into an
                exact lock — the same mechanism that traps real moons into
                mean-motion resonance. Locked orbits produce just intervals, so
                consonance emerges from gravity itself.
              </p>
              <p>
                The named reference is the{" "}
                <span className="text-foreground">Laplace resonance</span> of
                Jupiter&apos;s moons Io–Europa–Ganymede, whose orbital periods
                sit in a 4:2:1 chain.
              </p>
              <p>
                Swing hard to inject energy: the orbits destabilise, periods
                drift off simple ratios, and the intervals go microtonal and
                beating. Ease off and the system re-locks. On desktop, drag the
                canvas; leave it alone and a seeded autopilot keeps it alive.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── canvas renderer (art layer — raw color allowed here) ────────────────────

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  engine: OrreryEngine,
  ts: number,
) {
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const scale = Math.min(W, H) * 0.42;

  // fade previous frame for trails (dark violet wash)
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(8, 5, 16, 0.28)";
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = "lighter";

  const sx = (x: number) => cx + x * scale;
  const sy = (y: number) => cy + y * scale;

  // faint orbit rings
  for (const b of engine.bodies) {
    ctx.beginPath();
    ctx.strokeStyle = `hsla(${b.hue}, 70%, 60%, 0.10)`;
    ctx.lineWidth = Math.max(1, W * 0.0012);
    ctx.arc(cx, cy, b.a * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // resonance threads: bright arc + label between locked pairs
  for (const lk of engine.locks) {
    const bi = engine.bodies[lk.inner];
    const bo = engine.bodies[lk.outer];
    const alpha = 0.15 + lk.strength * 0.6;
    const grad = ctx.createLinearGradient(
      sx(bi.x),
      sy(bi.y),
      sx(bo.x),
      sy(bo.y),
    );
    grad.addColorStop(0, `hsla(${bi.hue}, 90%, 70%, ${alpha})`);
    grad.addColorStop(1, `hsla(${bo.hue}, 90%, 70%, ${alpha})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = (1 + lk.strength * 3) * Math.max(1, W * 0.0016);
    ctx.beginPath();
    ctx.moveTo(sx(bi.x), sy(bi.y));
    ctx.lineTo(sx(bo.x), sy(bo.y));
    ctx.stroke();

    // pulsing ratio label at midpoint
    const mx = (sx(bi.x) + sx(bo.x)) / 2;
    const my = (sy(bi.y) + sy(bo.y)) / 2;
    const pulse = 0.6 + 0.4 * Math.sin(ts / 260);
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `${Math.max(11, W * 0.014)}px ui-monospace, monospace`;
    ctx.fillStyle = `hsla(285, 90%, 82%, ${lk.strength * pulse})`;
    ctx.textAlign = "center";
    ctx.fillText(`${lk.ratio.p}:${lk.ratio.q}`, mx, my - 6);
    ctx.globalCompositeOperation = "lighter";
  }

  // trails
  for (const b of engine.bodies) {
    const tr = b.trail;
    for (let i = 2; i < tr.length; i += 2) {
      const a = (i / tr.length) * 0.5;
      ctx.strokeStyle = `hsla(${b.hue}, 80%, 65%, ${a})`;
      ctx.lineWidth = Math.max(1, W * 0.001);
      ctx.beginPath();
      ctx.moveTo(sx(tr[i - 2]), sy(tr[i - 1]));
      ctx.lineTo(sx(tr[i]), sy(tr[i + 1]));
      ctx.stroke();
    }
  }

  // central star
  const starR = Math.max(4, W * 0.008);
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, starR * 6);
  sg.addColorStop(0, "rgba(237, 233, 254, 0.95)");
  sg.addColorStop(0.3, "rgba(167, 139, 250, 0.6)");
  sg.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, starR * 6, 0, Math.PI * 2);
  ctx.fill();

  // bodies (glowing)
  for (let i = 0; i < engine.bodies.length; i++) {
    const b = engine.bodies[i];
    const x = sx(b.x);
    const y = sy(b.y);
    let glow = 0;
    for (const lk of engine.locks)
      if (lk.inner === i || lk.outer === i) glow = Math.max(glow, lk.strength);
    const r = Math.max(3, W * 0.006) * (1 + glow * 0.6);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, `hsla(${b.hue}, 95%, 85%, 0.95)`);
    g.addColorStop(0.4, `hsla(${b.hue}, 90%, 65%, ${0.5 + glow * 0.4})`);
    g.addColorStop(1, `hsla(${b.hue}, 90%, 60%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
