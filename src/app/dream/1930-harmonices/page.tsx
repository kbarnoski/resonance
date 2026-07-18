"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSystem,
  stepSystem,
  postStep,
  applyCaptureAssist,
  detectLocks,
  periodOf,
  phaseOf,
  smaOf,
  TILT_ACCEL,
  R_MAX,
  AMIN,
  AMAX,
  type Body,
  type Lock,
} from "./nbody";
import {
  OrreryVoices,
  glideFreqForPeriod,
  snapToJI,
  type VoiceState,
} from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";
import { README } from "./readme-text";

// ════════════════════════════════════════════════════════════════════════════
// 1930 — harmonices
//
// Orbital resonance as an instrument you play by TILTING. A symplectic N-body
// orrery under real gravity; tilt biases the gravity field; when two planets
// capture into a small-integer period ratio, a JUST-INTONATION dyad of exactly
// that ratio sounds — the true consonance the physics already is, never a
// pentatonic fake. Still device → the orbits circularize toward a lone drone.
//
// Kepler's Harmonices Mundi, the Antikythera/orrery tradition, and (as the
// pentatonic foil) ESO's TOI-178 & TRAPPIST-1 sonifications.
// ════════════════════════════════════════════════════════════════════════════

const TWO_PI = Math.PI * 2;

type InputMode = "waiting" | "sensor" | "pointer";

interface HudLock {
  p: number;
  q: number;
  strength: number;
}
interface Hud {
  locks: HudLock[];
  tilt: { x: number; y: number };
  calm: number;
}

const INTERVAL_NAMES: Record<string, string> = {
  "2:1": "octave",
  "3:2": "perfect fifth",
  "4:3": "perfect fourth",
  "5:3": "major sixth",
  "5:4": "major third",
  "3:1": "octave + fifth",
  "5:2": "octave + third",
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Build per-planet voice states, then override captured pairs to exact JI. */
function computeVoices(bodies: Body[], locks: Lock[]): VoiceState[] {
  const voices: VoiceState[] = bodies.map((b) => {
    const ph = phaseOf(b);
    return {
      freq: glideFreqForPeriod(periodOf(b)),
      gain: 0.055 + 0.05 * (1 - ph),
    };
  });
  const sorted = [...locks].sort((a, b) => b.strength - a.strength);
  const anchored = new Set<number>();
  for (const l of sorted) {
    const lowF = anchored.has(l.i)
      ? voices[l.i].freq
      : snapToJI(voices[l.i].freq);
    voices[l.i].freq = lowF;
    voices[l.j].freq = lowF * (l.p / l.q); // exact just interval above
    anchored.add(l.i);
    anchored.add(l.j);
    voices[l.i].gain = Math.min(0.34, voices[l.i].gain + 0.2 * l.strength);
    voices[l.j].gain = Math.min(0.34, voices[l.j].gain + 0.2 * l.strength);
  }
  return voices;
}

function guideRadius(b: Body): number {
  const a = smaOf(b);
  return clamp(isFinite(a) ? a : AMAX, AMIN, AMAX);
}

/** Render one frame of the brass-on-parchment orrery. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  bodies: Body[],
  locks: Lock[],
  tilt: { x: number; y: number },
  calm: number,
  reduced: boolean,
  grain: number[][],
  time: number,
): void {
  const w = W / dpr;
  const h = H / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  // ── parchment ground ──
  const bg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    10,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  bg.addColorStop(0, "#f4e9cf");
  bg.addColorStop(1, "#e0cca1");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  if (!reduced && grain.length) {
    ctx.fillStyle = "rgba(92,64,28,0.045)";
    for (const g of grain) {
      ctx.beginPath();
      ctx.arc(g[0] * w, g[1] * h, g[2], 0, TWO_PI);
      ctx.fill();
    }
  }

  const cx = w / 2;
  const cy = h / 2;
  const SCALE = (Math.min(w, h) * 0.44) / R_MAX;

  // ── engraved plate: outer rings + ticks ──
  ctx.strokeStyle = "rgba(120,86,40,0.4)";
  ctx.lineWidth = 1.2;
  for (const m of [1.03, 0.985]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R_MAX * SCALE * m, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(120,86,40,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TWO_PI;
    const r1 = R_MAX * SCALE * (i % 6 === 0 ? 0.93 : 0.965);
    const r2 = R_MAX * SCALE * 1.0;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }

  // ── orbit guide rings (dashed, at each planet's current semi-major axis) ──
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = "rgba(120,86,40,0.22)";
  ctx.lineWidth = 1;
  for (const b of bodies) {
    ctx.beginPath();
    ctx.arc(cx, cy, guideRadius(b) * SCALE, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── glowing trails ──
  for (const b of bodies) {
    const t = b.trail;
    if (t.length < 4) continue;
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = hexA(b.hue, 0.32);
    ctx.beginPath();
    ctx.moveTo(cx + t[0] * SCALE, cy + t[1] * SCALE);
    for (let k = 2; k < t.length; k += 2) {
      ctx.lineTo(cx + t[k] * SCALE, cy + t[k + 1] * SCALE);
    }
    ctx.stroke();
    // brighter head segment
    const n = t.length;
    if (n >= 8) {
      ctx.strokeStyle = hexA(b.hue, 0.7);
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(cx + t[n - 8] * SCALE, cy + t[n - 7] * SCALE);
      for (let k = n - 6; k < n; k += 2) {
        ctx.lineTo(cx + t[k] * SCALE, cy + t[k + 1] * SCALE);
      }
      ctx.stroke();
    }
  }

  // set of planets currently in any lock (for red rings)
  const locked = new Set<number>();
  for (const l of locks) {
    locked.add(l.i);
    locked.add(l.j);
  }

  // ── resonance lock arcs (deep red) + ratio labels ──
  for (const l of locks) {
    const a = bodies[l.i];
    const b = bodies[l.j];
    const ax = cx + a.x * SCALE;
    const ay = cy + a.y * SCALE;
    const bx = cx + b.x * SCALE;
    const by = cy + b.y * SCALE;
    const pulse = 0.55 + 0.45 * Math.sin(time * 0.006 + l.age * 4);
    ctx.strokeStyle = hexA("#9e2b25", (0.35 + 0.5 * l.strength) * pulse);
    ctx.lineWidth = 1 + 3.4 * l.strength;
    // bowed connector through the star region
    const mx = (ax + bx) / 2 + (cx - (ax + bx) / 2) * 0.35;
    const my = (ay + by) / 2 + (cy - (ay + by) / 2) * 0.35;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    // label
    ctx.fillStyle = hexA("#7c1f1a", 0.92);
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${l.p}:${l.q}`, mx, my - 2);
  }

  // ── planets ──
  bodies.forEach((b, i) => {
    const sx = cx + b.x * SCALE;
    const sy = cy + b.y * SCALE;
    const rad = 4.6 + i * 0.5;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 3.2);
    glow.addColorStop(0, hexA(b.hue, 0.5));
    glow.addColorStop(1, hexA(b.hue, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 3.2, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = b.hue;
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,38,14,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (locked.has(i)) {
      ctx.strokeStyle = hexA("#9e2b25", 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, rad + 3.5, 0, TWO_PI);
      ctx.stroke();
    }
  });

  // ── the star ──
  const starPulse = 1 + 0.05 * Math.sin(time * 0.002) + calm * 0.35;
  const sr = 13 * starPulse;
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 4);
  sg.addColorStop(0, "rgba(255,244,206,0.95)");
  sg.addColorStop(0.4, "rgba(214,164,74,0.7)");
  sg.addColorStop(1, "rgba(214,164,74,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, sr * 4, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#fff4ce";
  ctx.beginPath();
  ctx.arc(cx, cy, sr * 0.5, 0, TWO_PI);
  ctx.fill();

  // ── tilt compass (bottom-left) ──
  const gcx = 40;
  const gcy = h - 40;
  const gr = 24;
  ctx.strokeStyle = "rgba(120,86,40,0.55)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, 0, TWO_PI);
  ctx.stroke();
  ctx.fillStyle = "rgba(120,86,40,0.5)";
  ctx.beginPath();
  ctx.arc(gcx, gcy, 2, 0, TWO_PI);
  ctx.fill();
  const tmag = Math.min(1, Math.hypot(tilt.x, tilt.y));
  ctx.strokeStyle = hexA("#9e2b25", 0.5 + 0.5 * tmag);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(gcx, gcy);
  ctx.lineTo(gcx + tilt.x * gr, gcy + tilt.y * gr);
  ctx.stroke();

  ctx.restore();
}

export default function HarmonicesPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const locksRef = useRef<Lock[]>([]);
  const tiltRef = useRef({ x: 0, y: 0 });
  const smoothTiltRef = useRef({ x: 0, y: 0 });
  const calmRef = useRef(0);
  const calmTimerRef = useRef(0);
  const synthRef = useRef<OrreryVoices | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const sensorSeenRef = useRef(false);
  const inputModeRef = useRef<InputMode>("waiting");
  const reducedRef = useRef(false);
  const grainRef = useRef<number[][]>([]);

  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [inputMode, setInputMode] = useState<InputMode>("waiting");
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<Hud>({
    locks: [],
    tilt: { x: 0, y: 0 },
    calm: 0,
  });

  // one-time init: system, paper grain, reduced-motion
  useEffect(() => {
    bodiesRef.current = createSystem();
    const grain: number[][] = [];
    let s = 0x1930;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 220; i++) grain.push([rnd(), rnd(), 0.4 + rnd() * 1.1]);
    grainRef.current = grain;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  const applyOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma === null && e.beta === null) return;
    tiltRef.current = {
      x: clamp((e.gamma ?? 0) / 32, -1.2, 1.2),
      y: clamp((e.beta ?? 0) / 32, -1.2, 1.2),
    };
    if (!sensorSeenRef.current) {
      sensorSeenRef.current = true;
      inputModeRef.current = "sensor";
      setInputMode("sensor");
    }
  }, []);

  const applyPointer = useCallback((e: PointerEvent) => {
    if (inputModeRef.current === "sensor") return;
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    tiltRef.current = {
      x: clamp(nx * 1.1, -1.2, 1.2),
      y: clamp(ny * 1.1, -1.2, 1.2),
    };
  }, []);

  const startPlay = useCallback(async () => {
    if (phase === "playing") return;
    // audio inside the user gesture
    try {
      const synth = new OrreryVoices(bodiesRef.current.length);
      await synth.start();
      synthRef.current = synth;
    } catch {
      setAudioNotice(
        "Web Audio is unavailable in this browser — the orrery runs silent.",
      );
    }
    // orientation permission (iOS) inside the same gesture
    sensorSeenRef.current = false;
    inputModeRef.current = "waiting";
    setInputMode("waiting");
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res === "granted")
          window.addEventListener("deviceorientation", applyOrientation);
      } else if ("DeviceOrientationEvent" in window) {
        window.addEventListener("deviceorientation", applyOrientation);
      }
    } catch {
      /* no sensor — pointer carries it */
    }
    window.addEventListener("pointermove", applyPointer);
    // desktop fallback: no sensor within ~1s → pointer = tilt
    window.setTimeout(() => {
      if (!sensorSeenRef.current) {
        inputModeRef.current = "pointer";
        setInputMode("pointer");
      }
    }, 1000);
    setPhase("playing");
  }, [phase, applyOrientation, applyPointer]);

  // main loop — runs only while playing
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    lastRef.current = performance.now();
    let hudT = 0;

    const loop = () => {
      if (cancelled) return;
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      dt = clamp(dt, 0, 0.05);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (
        canvas.width !== Math.floor(cw * dpr) ||
        canvas.height !== Math.floor(ch * dpr)
      ) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }

      // smooth the tilt input
      const raw = tiltRef.current;
      const st = smoothTiltRef.current;
      const kS = Math.min(1, dt * 8);
      st.x += (raw.x - st.x) * kS;
      st.y += (raw.y - st.y) * kS;
      const tmag = Math.hypot(st.x, st.y);

      // calm accumulator → lone drone
      if (tmag < 0.06) calmTimerRef.current += dt;
      else calmTimerRef.current = 0;
      const targetCalm =
        calmTimerRef.current > 2
          ? Math.min(1, (calmTimerRef.current - 2) / 3)
          : 0;
      calmRef.current += (targetCalm - calmRef.current) * Math.min(1, dt * 1.5);
      const calm = calmRef.current;

      // integrate (2 symplectic substeps)
      const bodies = bodiesRef.current;
      const sub = 2;
      const sdt = dt / sub;
      for (let k = 0; k < sub; k++) {
        stepSystem(bodies, sdt, st.x * TILT_ACCEL, st.y * TILT_ACCEL);
        applyCaptureAssist(bodies, locksRef.current, sdt);
        postStep(bodies, sdt, calm);
      }

      // resonance detection + new-lock pings
      const prev = locksRef.current;
      const locks = detectLocks(bodies, prev, dt);
      const voices = computeVoices(bodies, locks);
      for (const l of locks) {
        const existed = prev.some(
          (p) =>
            (p.i === l.i && p.j === l.j) || (p.i === l.j && p.j === l.i),
        );
        if (!existed) synthRef.current?.ping(voices[l.j].freq);
      }
      locksRef.current = locks;
      synthRef.current?.update(voices, calm);

      // trails
      const maxTrail = reducedRef.current ? 36 : 110;
      for (const b of bodies) {
        b.trail.push(b.x, b.y);
        const excess = b.trail.length - maxTrail * 2;
        if (excess > 0) b.trail.splice(0, excess);
      }

      drawScene(
        ctx,
        canvas.width,
        canvas.height,
        dpr,
        bodies,
        locks,
        st,
        calm,
        reducedRef.current,
        grainRef.current,
        now,
      );

      if (now - hudT > 90) {
        hudT = now;
        setHud({
          locks: locks.map((l) => ({ p: l.p, q: l.q, strength: l.strength })),
          tilt: { x: st.x, y: st.y },
          calm,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // unmount teardown
  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", applyOrientation);
      window.removeEventListener("pointermove", applyPointer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      synthRef.current?.stop();
      synthRef.current = null;
    };
  }, [applyOrientation, applyPointer]);

  const modeLabel =
    inputMode === "sensor"
      ? "device tilt"
      : inputMode === "pointer"
        ? "pointer = tilt"
        : "listening for sensor…";

  const alive = hud.calm < 0.5;

  return (
    <main className="min-h-[calc(100vh-3rem)] w-full bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <header className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Harmonices
              </h1>
              <p className="mt-1 max-w-xl text-base text-muted-foreground">
                Play orbital resonance by tilting. When two planets lock into a
                whole-number period ratio you hear its real just-intonation
                interval — never a pentatonic fake.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </header>

        <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-lg border border-border shadow-lg">
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            aria-label="An antique orrery: a star and five planets orbiting under gravity, with resonance lock arcs."
          />
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#efe4cb]/85 backdrop-blur-sm">
              <p className="max-w-xs px-6 text-center text-base text-[#5a4326]">
                Tilt your phone — or move the pointer on a laptop — to steer the
                gravity field and pump planets into resonance.
              </p>
              <button
                onClick={startPlay}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Tilt to play
              </button>
            </div>
          )}
        </div>

        {audioNotice && (
          <p className="mt-3 text-sm text-destructive">{audioNotice}</p>
        )}

        {phase === "playing" && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                input: {modeLabel}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className={`font-mono text-xs uppercase tracking-[0.18em] ${
                  alive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {alive ? "orbits alive" : "decaying to drone — tilt to revive"}
              </span>
            </div>

            <div className="mt-3 min-h-[2.5rem]">
              {hud.locks.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  Seeking resonance — nudge two orbits toward a whole-number
                  ratio (3:2, 2:1, 4:3, 5:3, 5:4).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {hud.locks.map((l, idx) => {
                    const key = `${l.p}:${l.q}`;
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                        style={{
                          borderColor: "rgba(158,43,37,0.5)",
                          backgroundColor: `rgba(158,43,37,${0.06 + 0.14 * l.strength})`,
                          color: "#7c1f1a",
                        }}
                      >
                        <span className="font-mono font-semibold">{key}</span>
                        <span className="text-[#7c1f1a]/80">
                          {INTERVAL_NAMES[key] ?? "just interval"}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-base leading-relaxed text-muted-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1930-harmonices"]} />
    </main>
  );
}
