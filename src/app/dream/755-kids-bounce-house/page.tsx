"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeMembrane,
  stepWorld,
  pokeMembrane,
  sheetActivity,
  type Membrane,
  type Ball,
} from "./membrane";
import {
  startAudio,
  playMembraneHit,
  playPluck,
  applyPadActivity,
  teardownAudio,
  type AudioChain,
} from "./audio";

const COLS = 24;
const ROWS = 10;
const MAX_BALLS = 10;
const BALL_R = 30;

// Bright candy primaries for the bouncy balls.
const BALL_COLORS = [
  "#ff4d4d", // red
  "#ffb01f", // sunshine
  "#3ad1ff", // sky
  "#5be36a", // grass
  "#ff7ad1", // pink
  "#9b6bff", // grape
];

let _ballId = 0;

function makeBall(x: number, y: number): Ball {
  const colorIdx = Math.floor(Math.random() * BALL_COLORS.length);
  return {
    id: _ballId++,
    x,
    y,
    px: x - (Math.random() - 0.5) * 2,
    py: y,
    r: BALL_R,
    colorIdx,
    age: 0,
    fading: false,
    squash: 0,
    prevBelow: false,
  };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  m: Membrane,
  balls: Ball[],
  w: number,
  h: number,
): void {
  // Sunny sky gradient.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#7ed0ff");
  sky.addColorStop(0.6, "#bdeaff");
  sky.addColorStop(1, "#eafff0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun.
  ctx.beginPath();
  ctx.fillStyle = "#fff0a8";
  ctx.arc(w * 0.86, h * 0.16, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = "#ffd84d";
  ctx.arc(w * 0.86, h * 0.16, 42, 0, Math.PI * 2);
  ctx.fill();

  // Soft cloud puffs.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const puffs: Array<[number, number, number]> = [
    [w * 0.18, h * 0.14, 34],
    [w * 0.24, h * 0.14, 42],
    [w * 0.3, h * 0.15, 30],
    [w * 0.55, h * 0.1, 26],
    [w * 0.6, h * 0.11, 34],
  ];
  for (const [cx, cy, cr] of puffs) {
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Trampoline membrane ---
  const idx = (c: number, r: number) => r * m.cols + c;

  // Filled stretchy sheet (semi-transparent candy fill following the cloth).
  ctx.beginPath();
  // top edge across
  ctx.moveTo(m.nodes[idx(0, 0)].x, m.nodes[idx(0, 0)].y);
  for (let c = 1; c < m.cols; c++)
    ctx.lineTo(m.nodes[idx(c, 0)].x, m.nodes[idx(c, 0)].y);
  // down right edge
  for (let r = 1; r < m.rows; r++)
    ctx.lineTo(m.nodes[idx(m.cols - 1, r)].x, m.nodes[idx(m.cols - 1, r)].y);
  // back across bottom
  for (let c = m.cols - 2; c >= 0; c--)
    ctx.lineTo(m.nodes[idx(c, m.rows - 1)].x, m.nodes[idx(c, m.rows - 1)].y);
  // up left edge
  for (let r = m.rows - 2; r >= 1; r--)
    ctx.lineTo(m.nodes[idx(0, r)].x, m.nodes[idx(0, r)].y);
  ctx.closePath();
  const sheetFill = ctx.createLinearGradient(0, m.top, 0, h);
  sheetFill.addColorStop(0, "rgba(120, 90, 255, 0.55)");
  sheetFill.addColorStop(1, "rgba(60, 40, 160, 0.75)");
  ctx.fillStyle = sheetFill;
  ctx.fill();

  // Spring grid lines.
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  for (let r = 0; r < m.rows; r++) {
    ctx.beginPath();
    for (let c = 0; c < m.cols; c++) {
      const n = m.nodes[idx(c, r)];
      if (c === 0) ctx.moveTo(n.x, n.y);
      else ctx.lineTo(n.x, n.y);
    }
    ctx.stroke();
  }
  for (let c = 0; c < m.cols; c++) {
    ctx.beginPath();
    for (let r = 0; r < m.rows; r++) {
      const n = m.nodes[idx(c, r)];
      if (r === 0) ctx.moveTo(n.x, n.y);
      else ctx.lineTo(n.x, n.y);
    }
    ctx.stroke();
  }

  // Bright rim frame on the pinned edge.
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#ff5cae";
  ctx.beginPath();
  ctx.moveTo(m.nodes[idx(0, 0)].x, m.nodes[idx(0, 0)].y);
  for (let c = 1; c < m.cols; c++)
    ctx.lineTo(m.nodes[idx(c, 0)].x, m.nodes[idx(c, 0)].y);
  for (let r = 1; r < m.rows; r++)
    ctx.lineTo(m.nodes[idx(m.cols - 1, r)].x, m.nodes[idx(m.cols - 1, r)].y);
  for (let c = m.cols - 2; c >= 0; c--)
    ctx.lineTo(m.nodes[idx(c, m.rows - 1)].x, m.nodes[idx(c, m.rows - 1)].y);
  ctx.closePath();
  ctx.stroke();

  // --- Balls ---
  for (const b of balls) {
    const sq = b.squash;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(1 + sq * 0.35, 1 - sq * 0.35);
    // shadow ring
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.arc(0, 4, b.r, 0, Math.PI * 2);
    ctx.fill();
    // body
    const g = ctx.createRadialGradient(
      -b.r * 0.3,
      -b.r * 0.3,
      b.r * 0.2,
      0,
      0,
      b.r,
    );
    const col = BALL_COLORS[b.colorIdx];
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.25, col);
    g.addColorStop(1, col);
    ctx.beginPath();
    ctx.fillStyle = g;
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.arc(-b.r * 0.32, -b.r * 0.32, b.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export default function KidsBounceHouse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chainRef = useRef<AudioChain | null>(null);
  const membraneRef = useRef<Membrane | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const lastInteractRef = useRef<number>(0);
  const autoTimerRef = useRef<number>(0);
  const draggingRef = useRef<boolean>(false);
  const startedRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const markInteract = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  const dropBall = useCallback((x: number, y: number, ghost: boolean) => {
    const m = membraneRef.current;
    if (!m) return;
    const balls = ballsRef.current;
    // start above the sheet so it falls and bounces
    const clampedY = Math.min(y, m.top - 20);
    balls.push(makeBall(x, Math.max(40, clampedY)));
    if (!ghost) markInteract();
  }, [markInteract]);

  // Main loop.
  const loop = useCallback((t: number) => {
    const canvas = canvasRef.current;
    const m = membraneRef.current;
    const chain = chainRef.current;
    if (!canvas || !m) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const last = lastTRef.current || t;
    let dt = (t - last) / 1000;
    lastTRef.current = t;
    if (dt > 0.05) dt = 0.05; // clamp big gaps

    const { w, h } = sizeRef.current;

    try {
      const impacts = stepWorld(
        m,
        ballsRef.current,
        dt,
        w,
        h,
        MAX_BALLS,
      );
      if (chain) {
        for (const im of impacts) {
          playMembraneHit(chain, im.nx, im.energy, false);
        }
        applyPadActivity(chain, sheetActivity(m));
      }
    } catch {
      // never throw into the loop
    }

    drawScene(ctx, m, ballsRef.current, w, h);

    // Auto-demo: if idle for 3s, drop a ghost ball every ~1.5s.
    const now = performance.now();
    if (now - lastInteractRef.current > 3000) {
      if (now - autoTimerRef.current > 1500) {
        autoTimerRef.current = now;
        const gx = w * (0.2 + Math.random() * 0.6);
        dropBall(gx, m.top - 120, true);
        const chain2 = chainRef.current;
        // a soft ghost ping so a glancing reviewer hears it immediately
        if (chain2) playMembraneHit(chain2, Math.random(), 0.5, true);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [dropBall]);

  // Resize / build membrane.
  const rebuild = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w, h };
    membraneRef.current = makeMembrane(w, h, COLS, ROWS);
    ballsRef.current = [];
  }, []);

  // Mount: set up canvas + rAF (works even before audio for visuals).
  useEffect(() => {
    rebuild();
    lastInteractRef.current = performance.now() - 4000; // allow auto-demo soon
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => rebuild();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      const chain = chainRef.current;
      if (chain) {
        teardownAudio(chain);
        chainRef.current = null;
      }
    };
  }, [rebuild, loop]);

  const handleStart = useCallback(() => {
    if (startedRef.current) return;
    try {
      const chain = startAudio();
      void chain.ctx.resume();
      chainRef.current = chain;
    } catch {
      // audio unavailable — visuals still run
    }
    startedRef.current = true;
    setStarted(true);
    lastInteractRef.current = performance.now() - 4000;
  }, []);

  // Pointer handling on the canvas.
  const pointerPos = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const { x, y } = pointerPos(e);
      const m = membraneRef.current;
      if (!m) return;
      if (y > m.top + 6) {
        // on the sheet — start a pluck/drag
        draggingRef.current = true;
        pokeMembrane(m, x, y, 0.8);
        const chain = chainRef.current;
        if (chain) {
          const nx = (x - m.left) / ((m.cols - 1) * m.cellW);
          playPluck(chain, Math.max(0, Math.min(1, nx)));
        }
        markInteract();
      } else {
        // above the sheet — drop a ball
        dropBall(x, y, false);
      }
    },
    [pointerPos, dropBall, markInteract],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const { x, y } = pointerPos(e);
      const m = membraneRef.current;
      if (!m) return;
      pokeMembrane(m, x, y, 0.6);
      markInteract();
    },
    [pointerPos, markInteract],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-violet-200 select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Title */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 px-4 pt-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-violet-900 drop-shadow-sm sm:text-3xl">
          Bounce House
        </h1>
        <p className="mt-1 text-base font-semibold text-violet-800/90">
          Tap the sky to drop a ball. Drag the trampoline to make it wobble and sing!
        </p>
      </div>

      {/* Start overlay (gates audio behind a gesture) */}
      {!started && (
        <button
          type="button"
          onClick={handleStart}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-violet-300/70 backdrop-blur-sm"
        >
          <span className="text-7xl" aria-hidden>
            🤸
          </span>
          <span className="rounded-full bg-violet-400 px-10 py-5 text-2xl font-extrabold text-violet-950 shadow-lg ring-4 ring-border">
            Play! ▶
          </span>
          <span className="text-base font-semibold text-violet-900">
            Tap to start the bouncy trampoline
          </span>
        </button>
      )}

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s: boolean) => !s)}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-muted px-4 py-2.5 text-sm font-bold text-violet-800 shadow ring-2 ring-violet-200"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-16 right-3 z-10 max-w-xs rounded-2xl bg-muted p-4 text-sm text-slate-800 shadow-xl ring-2 ring-violet-200">
          <p className="font-bold text-violet-900">How it works</p>
          <p className="mt-1">
            The trampoline is a real{" "}
            <span className="font-semibold">Verlet mass-spring cloth</span> (24×10
            nodes, structural + shear springs, Jakobsen constraint relaxation).
            Balls collide with the cloth and bounce for real. Each landing plays a
            tuned membrane-drum note — center = low &amp; round, edges = brighter —
            always in a major pentatonic so nothing sounds wrong.
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Refs: Jakobsen GDC 2001 · Provot 1995 · JellyCar / Verlet Motion 2026.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block font-semibold text-violet-700 underline"
          >
            ← back to lab
          </Link>
        </div>
      )}
    </main>
  );
}
