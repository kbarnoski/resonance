"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  type AudioSourceKind,
} from "./audio";
import { GranularEngine } from "./granular";
import {
  GardenRenderer,
  FLOWER_PALETTE,
  type FlowerVisual,
  type TrailPoint,
} from "./renderer";

// ─── Seed physics constants ──────────────────────────────────────────────────
const FRICTION = 0.965;
const GRAVITY_SCALE = 0.00045; // tilt -> acceleration
const MAX_SPEED = 0.02; // normalized units / frame
const WALL_BOUNCE = 0.55;
const SEED_R = 0.045; // normalized radius for wall collision
const EMA_ALPHA = 0.12; // tilt smoothing
const DWELL_RADIUS = 0.06; // region size for "dwelling"
const DWELL_MS = 400; // how long to dwell before a flower blooms
const BLOOM_COOLDOWN_MS = 700; // min time between blooms
const AUTO_DEMO_DELAY = 2500; // ms with no interaction -> auto demo
const FADE_DOWN_AT = 13 * 60 * 1000; // ~13 min lullaby fade
const FADE_DOWN_SECS = 90;

type Phase = "intro" | "loading" | "playing";

interface Vec {
  x: number;
  y: number;
}

export default function PianoGardenPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [usingWebGL, setUsingWebGL] = useState(true);
  const [flowerCount, setFlowerCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // long-lived engine refs
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<GranularEngine | null>(null);
  const rendererRef = useRef<GardenRenderer | null>(null);
  const rafRef = useRef<number>(0);

  // physics state (normalized 0..1 space)
  const posRef = useRef<Vec>({ x: 0.5, y: 0.5 });
  const velRef = useRef<Vec>({ x: 0, y: 0 });
  const tiltRef = useRef<Vec>({ x: 0, y: 0 }); // smoothed gravity vector
  const neutralRef = useRef<Vec>({ x: 0, y: 0 }); // zeroed neutral hold

  // input state
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });
  const keyVecRef = useRef<Vec>({ x: 0, y: 0 });
  const interactedRef = useRef(false);
  const autoDemoRef = useRef(false);
  const lastInteractRef = useRef(0);

  // visual / bloom state
  const trailRef = useRef<TrailPoint[]>([]);
  const flowersRef = useRef<FlowerVisual[]>([]);
  const dwellRef = useRef<{ x: number; y: number; since: number }>({
    x: 0.5,
    y: 0.5,
    since: 0,
  });
  const lastBloomRef = useRef(0);
  const startedAtRef = useRef(0);
  const fadedRef = useRef(false);

  const markInteract = useCallback(() => {
    interactedRef.current = true;
    autoDemoRef.current = false;
    lastInteractRef.current = performance.now();
  }, []);

  // ── DeviceOrientation handler ──────────────────────────────────────────────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    // gamma: left-right tilt (-90..90), beta: front-back (-180..180)
    if (e.gamma == null || e.beta == null) return;
    const gx = Math.max(-45, Math.min(45, e.gamma)) / 45;
    const gy = Math.max(-45, Math.min(45, e.beta - 35)) / 45; // ~35deg holding
    // capture neutral on first reading
    if (neutralRef.current.x === 0 && neutralRef.current.y === 0) {
      neutralRef.current = { x: gx, y: gy };
    }
    const tx = gx - neutralRef.current.x;
    const ty = gy - neutralRef.current.y;
    tiltRef.current.x += (tx - tiltRef.current.x) * EMA_ALPHA;
    tiltRef.current.y += (ty - tiltRef.current.y) * EMA_ALPHA;
    markInteract();
  }, [markInteract]);

  // ── main loop ───────────────────────────────────────────────────────────────
  const step = useCallback(() => {
    const now = performance.now();
    const renderer = rendererRef.current;
    const engine = engineRef.current;
    if (!renderer || !engine) {
      rafRef.current = requestAnimationFrame(step);
      return;
    }

    // resize to displayed size
    const c = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, dpr);

    // ── gravity vector: tilt + drag + keys (+ auto demo) ──
    let gx = tiltRef.current.x;
    let gy = tiltRef.current.y;

    if (dragRef.current.active) {
      gx += dragRef.current.x;
      gy += dragRef.current.y;
    }
    gx += keyVecRef.current.x;
    gy += keyVecRef.current.y;

    // auto-demo: gentle synthetic oscillation if untouched
    if (!interactedRef.current && now - startedAtRef.current > AUTO_DEMO_DELAY) {
      autoDemoRef.current = true;
    }
    if (autoDemoRef.current) {
      const t = now / 1000;
      gx += Math.sin(t * 0.45) * 0.7;
      gy += Math.cos(t * 0.33) * 0.6;
    }

    // semi-implicit Euler
    const vel = velRef.current;
    vel.x += gx * GRAVITY_SCALE * 1000 * 0.016 * 0.6;
    vel.y += gy * GRAVITY_SCALE * 1000 * 0.016 * 0.6;
    vel.x *= FRICTION;
    vel.y *= FRICTION;
    const sp = Math.hypot(vel.x, vel.y);
    if (sp > MAX_SPEED) {
      vel.x = (vel.x / sp) * MAX_SPEED;
      vel.y = (vel.y / sp) * MAX_SPEED;
    }
    const pos = posRef.current;
    pos.x += vel.x;
    pos.y += vel.y;

    // soft wall bounce
    if (pos.x < SEED_R) {
      pos.x = SEED_R;
      vel.x = Math.abs(vel.x) * WALL_BOUNCE;
    } else if (pos.x > 1 - SEED_R) {
      pos.x = 1 - SEED_R;
      vel.x = -Math.abs(vel.x) * WALL_BOUNCE;
    }
    if (pos.y < SEED_R) {
      pos.y = SEED_R;
      vel.y = Math.abs(vel.y) * WALL_BOUNCE;
    } else if (pos.y > 1 - SEED_R) {
      pos.y = 1 - SEED_R;
      vel.y = -Math.abs(vel.y) * WALL_BOUNCE;
    }

    // ── trail ──
    trailRef.current.push({ x: pos.x, y: pos.y, t: now });
    if (trailRef.current.length > 24) trailRef.current.shift();
    trailRef.current = trailRef.current.filter((p) => now - p.t < 1500);

    // ── audio mapping: x -> read position & pitch degree, x -> pan ──
    const dur = engine.bufferDuration;
    const readPos = pos.x * Math.max(0.001, dur - 0.2);
    const degree01 = pos.x; // left low/early, right high/late
    // pad cloud pitch follows the seed degree, pentatonic-quantized
    const padRate = ratePent(degree01);
    engine.tick(readPos, padRate, pos.x * 2 - 1);

    // ── dwell detection -> bloom ──
    const d = dwellRef.current;
    const moved = Math.hypot(pos.x - d.x, pos.y - d.y);
    if (moved > DWELL_RADIUS) {
      d.x = pos.x;
      d.y = pos.y;
      d.since = now;
    } else if (
      now - d.since > DWELL_MS &&
      now - lastBloomRef.current > BLOOM_COOLDOWN_MS
    ) {
      // bloom!
      lastBloomRef.current = now;
      d.since = now; // reset so it can bloom again if it keeps dwelling
      const id = engine.bloomFlower(readPos, degree01);
      const color = FLOWER_PALETTE[flowersRef.current.length % FLOWER_PALETTE.length];
      flowersRef.current.push({
        id,
        x: pos.x,
        y: pos.y,
        color,
        born: now,
        baseR: 0.05 + Math.random() * 0.03,
        pulse: 1,
        alive: true,
      });
      // keep visual flowers in sync with engine cap (16)
      if (flowersRef.current.length > 16) flowersRef.current.shift();
      setFlowerCount(engine.singingCount);
    }

    // pulse flowers gently; brighten ones near the seed
    for (const f of flowersRef.current) {
      const near = Math.hypot(f.x - pos.x, f.y - pos.y) < 0.12 ? 0.5 : 0;
      const breathe = 0.5 + 0.5 * Math.sin(now / 700 + f.id);
      f.pulse += (0.35 + 0.35 * breathe + near - f.pulse) * 0.06;
    }

    // ── lullaby fade-down ──
    if (!fadedRef.current && now - startedAtRef.current > FADE_DOWN_AT) {
      fadedRef.current = true;
      engine.fadeDown(FADE_DOWN_SECS / 1);
    }

    renderer.render({
      seedX: pos.x,
      seedY: pos.y,
      trail: trailRef.current,
      flowers: flowersRef.current,
      now,
    });

    rafRef.current = requestAnimationFrame(step);
  }, []);

  // ── Start (first user gesture: unlock audio + request orientation) ──────────
  const start = useCallback(async () => {
    if (phase !== "intro") return;
    setPhase("loading");

    // create + resume context inside the gesture (iOS unlock)
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }

    // request DeviceOrientation permission inside the SAME gesture (iOS 13+)
    let sensorOk = false;
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        sensorOk = res === "granted";
      } catch {
        sensorOk = false;
      }
    } else if (typeof window.DeviceOrientationEvent !== "undefined") {
      sensorOk = true; // non-iOS: listener will simply work if hardware exists
    }

    if (sensorOk) {
      window.addEventListener("deviceorientation", onOrient);
      setSensorNote(null);
    } else {
      setSensorNote(
        "No tilt sensor here — drag anywhere to tilt the garden, or use the arrow keys.",
      );
    }

    // load Karel's recording (or fallback)
    let buffer = await fetchPianoBuffer(ctx);
    if (buffer) {
      setSource("piano");
    } else {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      setSource("fallback");
    }

    const engine = new GranularEngine(ctx, buffer, {
      maxVoices: 25,
      maxFlowers: 14,
    });
    engine.start();
    engineRef.current = engine;

    const renderer = new GardenRenderer(canvasRef.current!);
    rendererRef.current = renderer;
    setUsingWebGL(renderer.usingWebGL);

    startedAtRef.current = performance.now();
    lastInteractRef.current = performance.now();
    setPhase("playing");
    rafRef.current = requestAnimationFrame(step);
  }, [phase, onOrient, step]);

  // ── pointer + keyboard input (desktop fallback) ─────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const c = canvasRef.current;
    if (!c) return;

    const center = () => {
      const r = c.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r };
    };

    const onDown = (e: PointerEvent) => {
      markInteract();
      dragRef.current.active = true;
      applyDrag(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      applyDrag(e.clientX, e.clientY);
    };
    const onUp = () => {
      dragRef.current.active = false;
      dragRef.current.x = 0;
      dragRef.current.y = 0;
    };
    const applyDrag = (clientX: number, clientY: number) => {
      const { cx, cy, r } = center();
      // drag offset from center -> tilt direction, normalized
      dragRef.current.x = Math.max(-1, Math.min(1, (clientX - cx) / (r.width / 2)));
      dragRef.current.y = Math.max(-1, Math.min(1, (clientY - cy) / (r.height / 2)));
    };

    const onKey = (e: KeyboardEvent) => {
      const v = keyVecRef.current;
      if (e.type === "keydown") {
        if (e.key === "ArrowLeft") v.x = -0.9;
        else if (e.key === "ArrowRight") v.x = 0.9;
        else if (e.key === "ArrowUp") v.y = -0.9;
        else if (e.key === "ArrowDown") v.y = 0.9;
        else return;
        markInteract();
        e.preventDefault();
      } else {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") v.x = 0;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") v.y = 0;
      }
    };

    c.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [phase, markInteract]);

  // ── cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      engineRef.current?.dispose();
      rendererRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    };
  }, [onOrient]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: phase === "playing" ? "block" : "none" }}
      />

      {/* Intro / start gate */}
      {phase !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Papa&apos;s Piano Garden
          </h1>
          <p className="max-w-md text-base leading-relaxed text-white/80">
            Tilt the tablet to roll a glowing seed across a dark garden.
            Wherever it rests, Papa&apos;s real piano blooms into a singing
            flower of light. There are no wrong notes — only blooming.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={phase === "loading"}
            className="min-h-[64px] min-w-[64px] rounded-full bg-rose-400/90 px-10 py-4 text-xl font-semibold text-black transition hover:bg-rose-300 disabled:opacity-60"
          >
            {phase === "loading" ? "Planting…" : "Begin"}
          </button>
          <p className="font-mono text-base text-white/75">
            tilt · drag · arrow keys
          </p>
        </div>
      )}

      {/* Playing HUD */}
      {phase === "playing" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 select-none font-mono text-base text-white/75">
            <div className="text-white/95">Papa&apos;s Piano Garden</div>
            <div className="text-white/75">
              flowers singing: {flowerCount}
            </div>
            <div className="text-white/75">
              {source === "piano"
                ? "Karel's real piano"
                : source === "fallback"
                  ? "piano (offline voice)"
                  : ""}
              {usingWebGL ? " · WebGL2" : " · Canvas2D"}
            </div>
          </div>

          {sensorNote && (
            <div className="pointer-events-none absolute inset-x-0 top-4 mx-auto max-w-sm px-6 text-center text-base text-rose-300">
              {sensorNote}
            </div>
          )}

          {/* design-notes affordance */}
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="absolute bottom-4 right-4 min-h-[44px] rounded-full border border-white/20 bg-black/40 px-4 text-base text-white/80 backdrop-blur"
          >
            {showNotes ? "close" : "notes"}
          </button>

          {showNotes && (
            <div className="absolute bottom-20 right-4 max-w-xs rounded-2xl border border-white/15 bg-black/70 p-4 text-base leading-relaxed text-white/80 backdrop-blur">
              <p className="mb-2 text-white/95">Design notes</p>
              <p className="mb-2">
                A tilt-rolled seed scans Papa&apos;s recorded piano. Each grain
                of his recording is pitch-snapped to a C-major pentatonic, so
                everything stays in key. Dwell, and a flower blooms — it keeps
                singing a held grain-cloud, and the garden grows.
              </p>
              <Link href="/dream" className="font-mono text-rose-300 underline">
                ← back to the lab
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// pentatonic ratio helper (kept here to avoid extra imports in the loop)
const PENTA = [-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12, 14, 16];
function ratePent(degree01: number): number {
  const clamped = Math.max(0, Math.min(0.9999, degree01));
  const idx = Math.floor(clamped * PENTA.length);
  return Math.pow(2, PENTA[idx] / 12);
}
