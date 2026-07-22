"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2244-deep-now — "The Deep Now"
//
// THE ONE QUESTION: What if an altered state you PLAY was the dilation of time
// itself — where sustained attention makes a single moment stretch until one
// instant swells to fill everything (the "eternal now")?
//
// Grounding (see README.md): psychedelic time-dilation is NOT a sped-up/slowed
// internal pacemaker. 5-HT2A activation raises cortical excitability and sensory
// input GAIN, so the brain OVER-processes each moment — and more processing =
// time felt as DILATED (psypost 2026-03-20). Wittmann, *Felt Time*: subjective
// time expands with attention/arousal. Here that is PLAYED: the more you attend
// (press-and-hold), the more each moment's processing stretches.
//
// OUTPUT: SVG-DOM only — real <svg> elements mutated per frame (no canvas, no
// WebGL). HARMONY: D Dorian (modal) pitch + Sethares stretched partials.
// POLE: cosmic-ambient ARRIVAL — structure BUILDS and HANGS, nothing drains.
//
// PLAYED, MULTI-PARAMETER mechanic (all real-time, no autonomous ramp):
//   (1) press-and-hold → attention A, a slew-limited follower that rises while
//       held and eases back on release;
//   (2) x-position → modal scale degree (pitch);
//   (3) y-position → timbre brightness / register;
//   multiple simultaneous pointers layer independent voices.
// A drives timeScale (1 at rest → ~0.14 at deep attention): existing echoes
// visibly DECELERATE and hang; note envelopes & glides stretch by 1/timeScale.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { DeepNowAudio, xToDegree, type Voice } from "./audio";
import { mulberry32, randRange } from "./rng";

const SEED = 0x2244;
const ECHO_POOL = 260;
const LATT_RINGS = 13;
const LATT_SPOKES = 30;
const IDLE_MS = 7000; // after live input stops, autopilot resumes

interface Echo {
  el: SVGCircleElement;
  active: boolean;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  r0: number;
  growth: number;
  color: string;
  baseOpacity: number;
}

interface Held {
  voice: Voice | null;
  x: number;
  y: number;
  degree: number;
  bright: number;
  lastEchoMs: number;
  echoGapMs: number;
}

// Art-layer colour: within the SVG only, so off-brand-ish hues are allowed.
// Low brightness (bottom) → warm magenta; high (top) → cool indigo. Violet core.
function echoColor(bright: number): string {
  const h = 302 - 58 * bright;
  const l = 50 + 24 * bright;
  return `hsl(${h.toFixed(0)} 80% ${l.toFixed(0)}%)`;
}

export default function DeepNowPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const echoGRef = useRef<SVGGElement | null>(null);
  const lattGRef = useRef<SVGGElement | null>(null);
  const coreRef = useRef<SVGCircleElement | null>(null);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [shimmerOn, setShimmerOn] = useState(false);
  const [hud, setHud] = useState({ a: 0, moment: 1 });

  // ── mutable engine state (refs — never trigger re-render per frame) ──────────
  const audioRef = useRef<DeepNowAudio | null>(null);
  const sizeRef = useRef({ w: 1, h: 1 });
  const poolRef = useRef<Echo[]>([]);
  const lattRef = useRef<{ rings: SVGCircleElement[]; spokes: SVGLineElement[] }>({
    rings: [],
    spokes: [],
  });
  const heldRef = useRef<Map<number, Held>>(new Map());
  const realPointersRef = useRef<Set<number>>(new Set());
  const aRef = useRef(0); // attention follower A
  const tsRef = useRef(1); // timeScale
  const rndRef = useRef<() => number>(mulberry32(SEED));
  const shimmerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.4, floor: 0.6 }));
  const reducedRef = useRef(false);
  const rafRef = useRef(0);
  const startTsRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastLiveMsRef = useRef(-Infinity);
  const hudTickRef = useRef(0);

  // autopilot state machine
  const apRef = useRef({
    phase: "wait" as "wait" | "hold",
    nextAt: 400, // ms since start
    idx: 0,
    x: 0.5,
    y: 0.5,
    tx: 0.5,
    ty: 0.5,
  });

  // ── size tracking ───────────────────────────────────────────────────────────
  const measure = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    sizeRef.current = { w, h };
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const core = coreRef.current;
    if (core) {
      core.setAttribute("cx", String(w / 2));
      core.setAttribute("cy", String(h / 2));
    }
    const g = lattGRef.current;
    if (g) g.setAttribute("transform-origin", `${w / 2} ${h / 2}`);
  }, []);

  // ── build the SVG element pools imperatively (this is the SVG-DOM substrate) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const echoG = echoGRef.current;
    const lattG = lattGRef.current;
    if (!echoG || !lattG) return;

    const NS = "http://www.w3.org/2000/svg";

    // persistent lattice: concentric rings + radial spokes (the held bloom)
    const rings: SVGCircleElement[] = [];
    for (let i = 0; i < LATT_RINGS; i++) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("fill", "none");
      c.setAttribute("stroke", "hsl(268 75% 66%)");
      c.setAttribute("stroke-width", "1");
      c.setAttribute("opacity", "0");
      lattG.appendChild(c);
      rings.push(c);
    }
    const spokes: SVGLineElement[] = [];
    for (let i = 0; i < LATT_SPOKES; i++) {
      const ln = document.createElementNS(NS, "line");
      ln.setAttribute("stroke", "hsl(280 70% 70%)");
      ln.setAttribute("stroke-width", "1");
      ln.setAttribute("opacity", "0");
      lattG.appendChild(ln);
      spokes.push(ln);
    }
    lattRef.current = { rings, spokes };

    // echo pool
    const pool: Echo[] = [];
    for (let i = 0; i < ECHO_POOL; i++) {
      const el = document.createElementNS(NS, "circle");
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", "hsl(270 80% 62%)");
      el.setAttribute("stroke-width", "2");
      el.setAttribute("opacity", "0");
      el.setAttribute("r", "0");
      echoG.appendChild(el);
      pool.push({
        el,
        active: false,
        x: 0,
        y: 0,
        life: 0,
        maxLife: 1,
        r0: 0,
        growth: 0,
        color: "hsl(270 80% 62%)",
        baseOpacity: 0.5,
      });
    }
    poolRef.current = pool;

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      for (const e of pool) e.el.remove();
      for (const c of rings) c.remove();
      for (const s of spokes) s.remove();
    };
  }, [measure]);

  // ── played gestures (shared by real pointers AND the seeded autopilot) ───────
  const spawnEcho = useCallback((x: number, y: number, bright: number) => {
    const pool = poolRef.current;
    if (pool.length === 0) return;
    let e = pool.find((p) => !p.active);
    if (!e) {
      // recycle the oldest (largest life fraction)
      e = pool.reduce((a, b) => (a.life / a.maxLife > b.life / b.maxLife ? a : b));
    }
    const A = aRef.current;
    e.active = true;
    e.x = x;
    e.y = y;
    e.life = 0;
    // Lifetime STRETCHES with attention — fleeting at rest, near-eternal deep.
    e.maxLife = 1.3 * (1 + A * 7);
    e.r0 = 5 + randRange(rndRef.current, 0, 6);
    e.growth = 150 + randRange(rndRef.current, 0, 120);
    e.color = echoColor(bright);
    e.baseOpacity = 0.42 + 0.3 * bright;
  }, []);

  const press = useCallback(
    (id: number, x: number, y: number, nowMs: number) => {
      const { h } = sizeRef.current;
      const bright = 1 - Math.max(0, Math.min(1, y / h));
      const degree = xToDegree(Math.max(0, Math.min(1, x / sizeRef.current.w)));
      const audio = audioRef.current;
      const voice = audio ? audio.strike(degree, bright) : null;
      heldRef.current.set(id, {
        voice,
        x,
        y,
        degree,
        bright,
        lastEchoMs: nowMs,
        echoGapMs: 150,
      });
      spawnEcho(x, y, bright);
    },
    [spawnEcho],
  );

  const moveTo = useCallback(
    (id: number, x: number, y: number, nowMs: number) => {
      const held = heldRef.current.get(id);
      if (!held) return;
      const { w, h } = sizeRef.current;
      const bright = 1 - Math.max(0, Math.min(1, y / h));
      const degree = xToDegree(Math.max(0, Math.min(1, x / w)));
      held.x = x;
      held.y = y;
      held.degree = degree;
      held.bright = bright;
      held.voice?.update(degree, bright);
      // trailing echoes — the gap lengthens with attention (time thins out)
      const gap = held.echoGapMs * (1 + aRef.current * 6);
      if (nowMs - held.lastEchoMs >= gap) {
        held.lastEchoMs = nowMs;
        spawnEcho(x, y, bright);
      }
    },
    [spawnEcho],
  );

  const lift = useCallback((id: number) => {
    const held = heldRef.current.get(id);
    if (!held) return;
    held.voice?.release();
    heldRef.current.delete(id);
  }, []);

  // ── the render / physics loop ────────────────────────────────────────────────
  useEffect(() => {
    const step = (ts: number) => {
      rafRef.current = requestAnimationFrame(step);
      if (startTsRef.current === 0) {
        startTsRef.current = ts;
        lastTsRef.current = ts;
      }
      const elapsedMs = ts - startTsRef.current;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switch)

      // ---- autopilot (seeded, headless-safe self-demo) --------------------------
      const liveActive =
        realPointersRef.current.size > 0 || elapsedMs - lastLiveMsRef.current < IDLE_MS;
      const ap = apRef.current;
      const rnd = rndRef.current;
      if (liveActive) {
        if (heldRef.current.has(-1)) lift(-1);
        ap.phase = "wait";
        ap.nextAt = elapsedMs + 500;
      } else {
        if (ap.phase === "hold") {
          // ease the virtual pointer toward its drifting target (plays x/y)
          ap.x += (ap.tx - ap.x) * Math.min(1, dt * 0.6);
          ap.y += (ap.ty - ap.y) * Math.min(1, dt * 0.6);
          const { w, h } = sizeRef.current;
          moveTo(-1, ap.x * w, ap.y * h, elapsedMs);
        }
        if (elapsedMs >= ap.nextAt) {
          if (ap.phase === "wait") {
            // Pattern designed to SHOW the dilation arc: mostly short fleeting
            // taps, then an occasional long sustained hold (a swelling "now").
            const pat = ap.idx % 6;
            const long = pat === 2 || pat === 5;
            const veryLong = pat === 5;
            ap.x = randRange(rnd, 0.14, 0.86);
            ap.y = randRange(rnd, 0.2, 0.8);
            ap.tx = randRange(rnd, 0.14, 0.86);
            ap.ty = randRange(rnd, 0.2, 0.8);
            const { w, h } = sizeRef.current;
            press(-1, ap.x * w, ap.y * h, elapsedMs);
            const holdMs = long
              ? (veryLong ? 7000 : 4200) + randRange(rnd, 0, 900)
              : 520 + randRange(rnd, 0, 480);
            ap.phase = "hold";
            ap.nextAt = elapsedMs + holdMs;
          } else {
            lift(-1);
            ap.idx++;
            ap.phase = "wait";
            ap.nextAt = elapsedMs + 500 + randRange(rnd, 0, 1400);
          }
        }
      }

      // ---- attention follower A (slew-limited; rises held, eases on release) ----
      const pressed = heldRef.current.size > 0;
      const target = pressed ? 1 : 0;
      const tau = pressed ? 2.4 : 3.6; // seconds
      const k = 1 - Math.exp(-dt / tau);
      aRef.current += (target - aRef.current) * k;
      const A = aRef.current;
      // timeScale: 1 at rest → ~0.14 at deep attention (the dilation).
      const timeScale = 1 / (1 + A * 6);
      tsRef.current = timeScale;
      audioRef.current?.setDilation(A, timeScale);

      // ---- luminance safety: opt-in ≤3 Hz soft shimmer, else steady ------------
      const flick = shimmerRef.current.value(elapsedMs / 1000);

      // ---- advance & draw echoes (existing echoes DECELERATE with timeScale) ---
      const pool = poolRef.current;
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i];
        if (!e.active) continue;
        e.life += dt * timeScale; // <- subjective slow-motion at deep attention
        const p = e.life / e.maxLife;
        if (p >= 1) {
          e.active = false;
          e.el.setAttribute("opacity", "0");
          continue;
        }
        const r = e.r0 + e.growth * p;
        const op = e.baseOpacity * Math.pow(1 - p, 1.35) * flick;
        e.el.setAttribute("cx", e.x.toFixed(1));
        e.el.setAttribute("cy", e.y.toFixed(1));
        e.el.setAttribute("r", r.toFixed(1));
        e.el.setAttribute("stroke", e.color);
        e.el.setAttribute("stroke-width", (1 + 2.5 * (1 - p)).toFixed(2));
        e.el.setAttribute("opacity", op.toFixed(3));
      }

      // ---- the held bloom: persistent lattice materialises as A builds ---------
      const { w, h } = sizeRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(w, h) * 0.5;
      const { rings, spokes } = lattRef.current;
      const step0 = (maxR / (LATT_RINGS + 1)) * (0.6 + 0.7 * A);
      for (let i = 0; i < rings.length; i++) {
        const rr = step0 * (i + 1);
        rings[i].setAttribute("cx", cx.toFixed(1));
        rings[i].setAttribute("cy", cy.toFixed(1));
        rings[i].setAttribute("r", rr.toFixed(1));
        rings[i].setAttribute("opacity", (A * 0.16 * flick).toFixed(3));
      }
      for (let i = 0; i < spokes.length; i++) {
        const ang = (i / spokes.length) * Math.PI * 2;
        const inner = step0 * 0.6;
        const outer = maxR * (0.5 + 0.5 * A);
        spokes[i].setAttribute("x1", (cx + Math.cos(ang) * inner).toFixed(1));
        spokes[i].setAttribute("y1", (cy + Math.sin(ang) * inner).toFixed(1));
        spokes[i].setAttribute("x2", (cx + Math.cos(ang) * outer).toFixed(1));
        spokes[i].setAttribute("y2", (cy + Math.sin(ang) * outer).toFixed(1));
        spokes[i].setAttribute("opacity", (A * 0.1 * flick).toFixed(3));
      }
      // very slow rotation of the whole held structure (motion, not flicker)
      const rot = reducedRef.current ? 0 : elapsedMs * 0.0018 * (0.4 + A);
      lattGRef.current?.setAttribute(
        "transform",
        `rotate(${rot % 360} ${cx} ${cy})`,
      );

      // ---- central "now" core -------------------------------------------------
      const core = coreRef.current;
      if (core) {
        const breathAmp = reducedRef.current ? 0.02 : 0.12;
        const breath = 1 + breathAmp * Math.sin((elapsedMs / 1000) * 2 * Math.PI * 0.14);
        const rCore = (10 + 42 * A) * breath;
        core.setAttribute("r", rCore.toFixed(1));
        core.setAttribute("opacity", ((0.35 + 0.5 * A) * flick).toFixed(3));
      }

      // ---- throttled HUD ------------------------------------------------------
      if (elapsedMs - hudTickRef.current > 90) {
        hudTickRef.current = elapsedMs;
        setHud({ a: A, moment: 1 / timeScale });
      }

      audioRef.current?.reap();
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [press, moveTo, lift]);

  // full teardown of audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // ── pointer handlers ─────────────────────────────────────────────────────────
  const localXY = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const sx = sizeRef.current.w / Math.max(1, r.width);
    const sy = sizeRef.current.h / Math.max(1, r.height);
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    realPointersRef.current.add(e.pointerId);
    lastLiveMsRef.current = performance.now() - startTsRef.current;
    if (heldRef.current.has(-1)) lift(-1); // autopilot yields immediately
    const { x, y } = localXY(e);
    press(e.pointerId, x, y, lastLiveMsRef.current);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!realPointersRef.current.has(e.pointerId)) return;
    const nowMs = performance.now() - startTsRef.current;
    lastLiveMsRef.current = nowMs;
    const { x, y } = localXY(e);
    moveTo(e.pointerId, x, y, nowMs);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!realPointersRef.current.has(e.pointerId)) return;
    realPointersRef.current.delete(e.pointerId);
    lastLiveMsRef.current = performance.now() - startTsRef.current;
    lift(e.pointerId);
  };

  // ── begin (creates the AudioContext on a user gesture) ───────────────────────
  const begin = useCallback(() => {
    setStarted(true);
    if (audioRef.current) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setAudioError("Web Audio is unavailable — visuals continue silently.");
        return;
      }
      const ctx = new AC();
      ctx.resume().catch(() => {});
      audioRef.current = new DeepNowAudio(ctx);
    } catch {
      setAudioError("Could not start audio — visuals continue silently.");
    }
  }, []);

  const toggleShimmer = useCallback(() => {
    setShimmerOn((on) => {
      const next = !on;
      if (next) shimmerRef.current.enable();
      else shimmerRef.current.kill();
      return next;
    });
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <radialGradient id="dn-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(266 90% 78%)" />
            <stop offset="55%" stopColor="hsl(272 80% 60%)" />
            <stop offset="100%" stopColor="hsl(280 70% 46%)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={lattGRef} />
        <g ref={echoGRef} />
        <circle ref={coreRef} fill="url(#dn-core)" opacity="0" r="0" />
      </svg>

      {/* HUD readout */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-1 text-right">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          attention {(hud.a * 100).toFixed(0)}%
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          moment ×{hud.moment.toFixed(1)}
        </span>
        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${(hud.a * 100).toFixed(0)}%` }}
          />
        </div>
      </div>

      {/* design-notes affordance */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground"
        >
          {showNotes ? "close notes" : "design notes"}
        </button>
      </div>

      {/* shimmer control (opt-in, ≤3 Hz, safe) */}
      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={toggleShimmer}
          className={`pointer-events-auto min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
            shimmerOn
              ? "border-primary bg-primary/20 text-foreground"
              : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title="Opt-in slow luminance shimmer, hard-capped ≤3 Hz (photosensitive-safe)"
        >
          Shimmer {shimmerOn ? "on" : "off"}
        </button>
      </div>

      {audioError && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-xs text-sm text-destructive">
          {audioError}
        </div>
      )}

      {/* intro overlay — visuals already self-demo behind it */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-lg border border-border bg-background/90 p-8 shadow-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Resonance · dream lab
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              The Deep Now
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              Press and hold anywhere. The longer you attend, the more each moment
              stretches — echoes decelerate and hang, tones bloom, and a single
              instant swells to fill everything. Move to play pitch (x) and timbre
              (y); use several fingers at once.
            </p>
            <button
              onClick={begin}
              className="mt-6 min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="mt-3 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              a seeded autopilot is already playing
            </p>
          </div>
        </div>
      )}

      {/* notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background/95 p-8 shadow-2xl">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes — The Deep Now
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The question:</span> what if an
              altered state you PLAY was the dilation of time itself — sustained
              attention stretching a single moment into an eternal now?
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The science:</span> psychedelic
              time-dilation is not a sped-up or slowed internal pacemaker. 5-HT2A
              activation raises cortical excitability and sensory input gain, so
              the brain over-processes each moment — and more processing is felt
              as more elapsed time (psypost, 2026-03-20). Marc Wittmann&apos;s{" "}
              <span className="italic">Felt Time</span> shows subjective duration
              expands with attention and arousal. Here that is played: press-and-
              hold raises an attention level A, and A scales how long each
              echo&apos;s processing (its lifetime and near-frozen motion) lasts.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">How it works:</span> A is a
              slew-limited follower (rises while held, eases back on release) that
              drives a timeScale from 1 (rest) toward ~0.14 (deep now). Existing
              SVG echoes advance by dt×timeScale, so they visibly decelerate;
              their lifetimes stretch; audio envelopes and glides stretch by
              1/timeScale; the reverb tail blooms toward the eternal. Pitch is a
              modal D-Dorian scale; timbre uses Sethares stretched partials
              (f₀·s^log₂k, s≈2.06). Pitch stays stable — only time stretches.
            </p>
            <div className="mt-5 flex items-center gap-4">
              <Link
                href="/dream/2244-deep-now/README.md"
                className="font-mono text-xs uppercase tracking-[0.18em] text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                Full README
              </Link>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
