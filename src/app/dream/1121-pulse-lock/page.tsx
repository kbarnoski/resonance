"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  makeEntrainState,
  registerTap,
  runGhost,
  sourceLabel,
  stepEntrain,
  type EntrainState,
  type Side,
} from "./kuramoto";
import { makePulseAudio, type PulseAudio } from "./audio";

type Phase = "idle" | "running";

interface Ripple {
  x: number;
  y: number;
  age: number; // 0..1
  hue: number;
}

interface Readout {
  bpmA: number;
  bpmB: number;
  align: number;
  source: "two-players" | "ghost-partner";
}

const HUE_A = 344; // rose
const HUE_B = 34; // amber

/* ── drawing helpers (never named use*) ─────────────────────────────────── */

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lock: number,
) {
  // Warm, non-black field that lifts slightly as the pair locks. Fully
  // repainted each frame — slow luminance drift only, no flicker/strobe.
  const g = ctx.createRadialGradient(
    w / 2,
    h * 0.52,
    0,
    w / 2,
    h * 0.52,
    Math.max(w, h) * 0.75,
  );
  const warm = 8 + lock * 10;
  g.addColorStop(0, `hsl(${18 + lock * 10}, 42%, ${warm}%)`);
  g.addColorStop(0.6, `hsl(${350}, 30%, ${5 + lock * 4}%)`);
  g.addColorStop(1, `hsl(${20}, 40%, 3%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawLobe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rot: number,
  hue: number,
  swell: number,
  petals: number,
) {
  const glow = radius * (2.4 + swell * 0.8);
  const rg = ctx.createRadialGradient(x, y, 0, x, y, glow);
  rg.addColorStop(0, `hsla(${hue}, 90%, ${60 + swell * 18}%, 0.5)`);
  rg.addColorStop(0.4, `hsla(${hue}, 85%, 55%, 0.18)`);
  rg.addColorStop(1, `hsla(${hue}, 80%, 45%, 0)`);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.arc(x, y, glow, 0, Math.PI * 2);
  ctx.fill();

  // A rotating petal-flower whose reach breathes with the swell.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  const steps = petals * 24;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr =
      radius * (0.62 + 0.38 * Math.abs(Math.cos(petals * a * 0.5))) *
      (0.9 + swell * 0.28);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = `hsla(${hue}, 92%, ${64 + swell * 16}%, ${0.32 + swell * 0.28})`;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = `hsla(${hue}, 95%, 78%, ${0.4 + swell * 0.3})`;
  ctx.stroke();
  ctx.restore();
}

function drawFilament(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  lock: number,
) {
  if (lock <= 0.02) return;
  const grad = ctx.createLinearGradient(ax, ay, bx, by);
  grad.addColorStop(0, `hsla(${HUE_A}, 95%, 72%, ${0.15 + lock * 0.7})`);
  grad.addColorStop(0.5, `hsla(15, 95%, 80%, ${0.2 + lock * 0.75})`);
  grad.addColorStop(1, `hsla(${HUE_B}, 95%, 72%, ${0.15 + lock * 0.7})`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1 + lock * 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rot: number,
  lock: number,
) {
  // As the two lock, a shared symmetric bloom rises between them.
  if (lock <= 0.05) return;
  const n = 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot * 0.5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (1.1 + lock * 0.6);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, radius * 0.6);
    const hue = 15 + Math.sin(a) * 20;
    pg.addColorStop(0, `hsla(${hue}, 95%, 75%, ${0.06 + lock * 0.22})`);
    pg.addColorStop(1, `hsla(${hue}, 95%, 60%, 0)`);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMeter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  align: number,
) {
  // Phase-alignment ring around the mandala.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
  ctx.strokeStyle = "hsla(30, 30%, 70%, 0.12)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * align);
  ctx.strokeStyle = `hsla(${20 + align * 20}, 90%, ${60 + align * 15}%, ${0.5 + align * 0.4})`;
  ctx.lineWidth = 3 + align * 3;
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawZones(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // A faint seam marking the two press zones.
  ctx.strokeStyle = "hsla(30, 30%, 80%, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.12);
  ctx.lineTo(w / 2, h * 0.88);
  ctx.stroke();
}

export default function PulseLockPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    bpmA: 0,
    bpmB: 0,
    align: 0,
    source: "ghost-partner",
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<EntrainState | null>(null);
  const audioRef = useRef<PulseAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastMsRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({
    w: 0,
    h: 0,
    dpr: 1,
  });
  const ripplesRef = useRef<Ripple[]>([]);
  const readoutMsRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const spinRef = useRef<number>(0);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    sizeRef.current = { w, h, dpr };
  }, []);

  const spawnRipple = useCallback((side: Side) => {
    const { w, h } = sizeRef.current;
    if (w === 0) return;
    const x = side === "a" ? w * 0.28 : w * 0.72;
    ripplesRef.current.push({
      x,
      y: h * 0.5,
      age: 0,
      hue: side === "a" ? HUE_A : HUE_B,
    });
    if (ripplesRef.current.length > 12) ripplesRef.current.shift();
  }, []);

  const tap = useCallback(
    (side: Side, human: boolean) => {
      const state = stateRef.current;
      if (!state) return;
      registerTap(state, side, performance.now(), human);
      if (human) {
        audioRef.current?.tapAccent(side);
        spawnRipple(side);
      }
    },
    [spawnRipple],
  );

  const renderLoop = useCallback(() => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    const now = performance.now();
    let dt = (now - lastMsRef.current) / 1000;
    lastMsRef.current = now;
    if (dt > 0.1) dt = 0.1;

    if (state && canvas) {
      // Deterministic ghost fills any inactive side.
      const ghosted = runGhost(state, now);
      if (ghosted) audioRef.current?.pulse(ghosted, 0.5);

      const ev = stepEntrain(state, dt, now);
      if (ev.a) {
        audioRef.current?.pulse("a", 0.6);
        spawnRipple("a");
      }
      if (ev.b) {
        audioRef.current?.pulse("b", 0.6);
        spawnRipple("b");
      }

      audioRef.current?.update(
        state.a.swell,
        state.b.swell,
        state.alignment,
        state.lock,
      );

      const ctx = canvas.getContext("2d");
      const { w, h } = sizeRef.current;
      if (ctx && w > 0) {
        const cx = w / 2;
        const cy = h * 0.5;
        const base = Math.min(w, h);
        const lobeR = base * 0.11;
        const motion = reducedRef.current ? 0.25 : 1;
        spinRef.current += dt * 0.15 * motion;

        drawBackground(ctx, w, h, state.lock);
        drawZones(ctx, w, h);

        // Lobes orbit their anchors on their own phases; the anchors slide
        // together as lock rises so aligned phases literally fuse.
        const sep = base * 0.16 * (1 - 0.9 * state.lock);
        const orbit = base * 0.05 * (1 - 0.6 * state.lock) * motion;
        const ax = cx - sep + Math.cos(state.a.theta) * orbit;
        const ay = cy + Math.sin(state.a.theta) * orbit;
        const bx = cx + sep + Math.cos(state.b.theta) * orbit;
        const by = cy + Math.sin(state.b.theta) * orbit;

        drawMeter(ctx, cx, cy, base * 0.3, state.alignment);

        ctx.globalCompositeOperation = "lighter";
        drawBloom(ctx, cx, cy, lobeR, spinRef.current, state.lock);
        drawFilament(ctx, ax, ay, bx, by, state.lock);
        drawLobe(
          ctx,
          ax,
          ay,
          lobeR,
          spinRef.current + state.a.theta * 0.5,
          HUE_A,
          state.a.swell,
          5,
        );
        drawLobe(
          ctx,
          bx,
          by,
          lobeR,
          -spinRef.current - state.b.theta * 0.5,
          HUE_B,
          state.b.swell,
          6,
        );

        // ripples
        const rips = ripplesRef.current;
        for (let i = rips.length - 1; i >= 0; i--) {
          const r = rips[i];
          r.age += dt * 1.6;
          if (r.age >= 1) {
            rips.splice(i, 1);
            continue;
          }
          const rr = lobeR * (0.5 + r.age * 3);
          ctx.beginPath();
          ctx.arc(r.x, r.y, rr, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${r.hue}, 95%, 72%, ${(1 - r.age) * 0.35})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Throttle React state updates to ~5 Hz (refs drive the animation).
      if (now - readoutMsRef.current > 200) {
        readoutMsRef.current = now;
        setReadout({
          bpmA: Math.round(state.a.bpm),
          bpmB: Math.round(state.b.bpm),
          align: state.alignment,
          source: sourceLabel(state),
        });
      }
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [spawnRipple]);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    setError(null);
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    stateRef.current = makeEntrainState();
    resize();

    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      const audio = makePulseAudio(ac);
      audio.begin();
      audioRef.current = audio;
    } catch {
      setError("Audio could not start — the mandala turns on, silently.");
    }

    lastMsRef.current = performance.now();
    setPhase("running");
  }, [phase, resize]);

  // pointer + keyboard input while running
  useEffect(() => {
    if (phase !== "running") return;

    const onPointerDown = (e: PointerEvent) => {
      const side: Side = e.clientX < window.innerWidth / 2 ? "a" : "b";
      tap(side, true);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "f") tap("a", true);
      else if (k === "j") tap("b", true);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resize);
    };
  }, [phase, tap, resize]);

  // run loop
  useEffect(() => {
    if (phase !== "running") return;
    lastMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, renderLoop]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1500);
      }
      acRef.current = null;
    };
  }, []);

  const alignPct = Math.round(readout.align * 100);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#140a0c] text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {/* header + controls */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-semibold text-2xl tracking-tight text-foreground sm:text-3xl">
          Pulse · Lock
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          Two people, one screen. Tap your own pulse on your side — and feel your
          two rhythms <em>fall into sync</em> as the piece blooms into consonance.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 backdrop-blur transition hover:bg-violet-500/30"
            >
              Begin
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-full border border-border bg-black/30 px-4 py-2.5 text-base text-muted-foreground backdrop-blur transition hover:bg-black/50"
          >
            {notesOpen ? "close notes" : "Read the design notes"}
          </button>
        </div>

        {phase === "idle" && (
          <p className="mt-3 text-base text-muted-foreground">
            tap to begin — sound and visuals start together
          </p>
        )}
        {phase === "running" && (
          <>
            <p className="mt-3 text-base text-muted-foreground">
              left half or <span className="text-violet-300">F</span> = you · right
              half or <span className="text-violet-300">J</span> = them
            </p>
            {readout.source === "ghost-partner" && (
              <p className="mt-1 text-base text-muted-foreground">
                better with two — a ghost partner is holding the other side
              </p>
            )}
          </>
        )}
        {error && <p className="mt-2 text-base text-violet-300">{error}</p>}
      </div>

      {/* live status readout */}
      {phase === "running" && (
        <div className="pointer-events-none fixed right-4 top-4 z-30 rounded-2xl border border-border bg-black/40 px-4 py-3 text-right backdrop-blur">
          <div className="text-base tabular-nums text-foreground">
            <span className="text-violet-300">{readout.bpmA}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-violet-300">{readout.bpmB}</span>
            <span className="text-muted-foreground"> bpm</span>
          </div>
          <div className="mt-1 text-base tabular-nums text-muted-foreground">
            phase-lock {alignPct}%
          </div>
          <div className="mt-1 text-base text-muted-foreground">{readout.source}</div>
        </div>
      )}

      {/* design notes */}
      {notesOpen && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-border bg-black/90 p-5 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:bottom-4 sm:top-auto sm:max-w-md sm:rounded-2xl sm:border">
          <h2 className="text-xl text-foreground">Design notes</h2>
          <p className="mt-2 text-base leading-relaxed text-foreground">
            Each person is a phase oscillator with a natural frequency ω set by how
            fast they tap. A coupling term <em>K·sin(θ₂ − θ₁)</em> — the two-body{" "}
            <em>Kuramoto model</em> — gently pulls the two phases together. When the
            tempos are close enough, the pair <em>entrains</em>: the phase
            difference collapses and they phase-lock.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            The visuals and sound share that one state. Two warm lobes (rose · amber)
            orbit on their own phases and fuse into one symmetric bloom as they lock,
            with a brightening filament between them. The bell voices sit on a shared
            just-intonation scale; a <em>union</em> voice blooms as alignment rises,
            its detune collapsing from a beating shimmer into a fused unison, while
            reverb and brightness open.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Alone? A deterministic seeded ghost partner taps a near-miss tempo on the
            other side, so you can still watch and hear the two drift toward lock.
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            see README.md in this prototype&apos;s folder for full references.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["1121-pulse-lock"]} />
    </main>
  );
}
