"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { bootAudio, type AudioEngine } from "./audio";
import { createRenderer, type Renderer } from "./render";

/**
 * Two Suns — a polytonality toy for 4-year-olds.
 *
 * Two glowing suns float on a dusk sky. Each one quietly rings its OWN key
 * (Sun A = C major, warm/gold; Sun B = A major, cool/violet) at the same time.
 * Drag them apart → two clearly separated tonal worlds, panned left & right.
 * Drag them together → the keys ring densely as one bittersweet bitonal
 * shimmer, and their light blooms into a soft corona. It never resolves to one
 * key — it rests wherever the child leaves it.
 *
 * No reading required: color + light + sound are the whole language.
 */

interface Sun {
  x: number; // normalised [0,1] left→right
  y: number; // normalised [0,1] top→bottom (screen convention)
  vx: number; // auto-drift velocity
  vy: number;
  pointerId: number | null; // which finger is holding this sun (null = free)
}

export default function KidsTwoSuns() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sunsRef = useRef<Sun[]>([
    { x: 0.28, y: 0.42, vx: 0.018, vy: 0.012, pointerId: null },
    { x: 0.72, y: 0.55, vx: -0.015, vy: -0.014, pointerId: null },
  ]);
  const lastTouchRef = useRef<number>(0); // last time a child touched (for auto-drift)
  const rafRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);

  // ── Boot everything on the first gesture (browsers require a gesture for audio).
  function startEverything() {
    if (started) return;
    engineRef.current = bootAudio();
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Renderer: WebGL2 shader, with Canvas2D fallback.
    const renderer = createRenderer(canvas);
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (renderer) {
      rendererRef.current = renderer;
    } else {
      setWebglOk(false);
      ctx2d = canvas.getContext("2d");
    }

    function applyResize() {
      const c = canvasRef.current;
      if (!c) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (rendererRef.current) {
        rendererRef.current.resize(w, h);
      } else {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
      }
    }
    applyResize();
    window.addEventListener("resize", applyResize);

    const start = performance.now();
    lastTouchRef.current = start;

    // ── Canvas2D fallback drawing (radial gradients) ──────────────────────────
    function drawFallback(energy: number, overlap: number) {
      const c = canvasRef.current;
      if (!c || !ctx2d) return;
      const w = c.width;
      const h = c.height;
      const g = ctx2d;
      // Dusk sky.
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#0a0a1c");
      sky.addColorStop(1, "#241222");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      const pulse = 0.9 + 0.2 * energy;
      const suns = sunsRef.current;
      const colors = ["255,158,51", "140,115,255"];
      for (let i = 0; i < 2; i++) {
        const sx = suns[i].x * w;
        const sy = suns[i].y * h;
        const rad = Math.min(w, h) * 0.42 * pulse;
        const grad = g.createRadialGradient(sx, sy, 0, sx, sy, rad);
        grad.addColorStop(0, `rgba(${colors[i]},0.95)`);
        grad.addColorStop(0.18, `rgba(${colors[i]},0.55)`);
        grad.addColorStop(1, `rgba(${colors[i]},0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(sx, sy, rad, 0, Math.PI * 2);
        g.fill();
      }
      // Corona bloom where they meet.
      if (overlap > 0.02) {
        const mx = ((suns[0].x + suns[1].x) / 2) * w;
        const my = ((suns[0].y + suns[1].y) / 2) * h;
        const rad = Math.min(w, h) * 0.3 * overlap;
        const grad = g.createRadialGradient(mx, my, 0, mx, my, rad);
        grad.addColorStop(0, `rgba(255,245,225,${0.7 * overlap})`);
        grad.addColorStop(1, "rgba(255,245,225,0)");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(mx, my, rad, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    function loop(now: number) {
      const tSec = (now - start) / 1000;
      const dt = 1 / 60;
      const suns = sunsRef.current;
      const idle = now - lastTouchRef.current > 3500; // auto-demo after stillness

      for (const s of suns) {
        if (s.pointerId !== null) continue; // held by a finger — don't drift
        if (idle) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          // Bounce softly off the edges so the piece stays alive on screen.
          if (s.x < 0.12 || s.x > 0.88) s.vx *= -1;
          if (s.y < 0.18 || s.y > 0.82) s.vy *= -1;
          s.x = Math.max(0.12, Math.min(0.88, s.x));
          s.y = Math.max(0.18, Math.min(0.82, s.y));
        }
      }

      // How close are the two suns? → overlap / blend amount.
      const dx = suns[0].x - suns[1].x;
      const dy = suns[0].y - suns[1].y;
      const dist = Math.hypot(dx, dy);
      // Near 0 distance → full overlap; ~0.6 apart → none.
      const overlap = Math.max(0, Math.min(1, 1 - dist / 0.6));

      const engine = engineRef.current;
      let energy = 0;
      if (engine) {
        energy = engine.energy();
        // Presence: a sun is most present when alone-and-bright; as they
        // overlap both stay present so the cluster rings full.
        for (let i = 0; i < 2; i++) {
          const pan = suns[i].x * 2 - 1; // [-1,1] by horizontal position
          const present = 0.55 + 0.45 * overlap;
          engine.setSun(i as 0 | 1, pan, present, overlap);
        }
      }

      if (rendererRef.current) {
        rendererRef.current.draw(
          {
            // Shader uses GL convention (y up), so flip y.
            sunA: { x: suns[0].x, y: 1 - suns[0].y },
            sunB: { x: suns[1].x, y: 1 - suns[1].y },
            energy,
            overlap,
          },
          tSec,
        );
      } else {
        drawFallback(energy, overlap);
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    // ── Multi-touch / pointer dragging ─────────────────────────────────────────
    function normPos(clientX: number, clientY: number) {
      return { x: clientX / window.innerWidth, y: clientY / window.innerHeight };
    }

    function nearestSun(x: number, y: number): number {
      const suns = sunsRef.current;
      const d0 = Math.hypot(suns[0].x - x, suns[0].y - y);
      const d1 = Math.hypot(suns[1].x - x, suns[1].y - y);
      return d0 <= d1 ? 0 : 1;
    }

    function onPointerDown(e: PointerEvent) {
      lastTouchRef.current = performance.now();
      const { x, y } = normPos(e.clientX, e.clientY);
      const suns = sunsRef.current;
      // Pick the nearest sun NOT already held by another finger.
      let idx = nearestSun(x, y);
      if (suns[idx].pointerId !== null) idx = idx === 0 ? 1 : 0;
      if (suns[idx].pointerId !== null) return; // both held
      suns[idx].pointerId = e.pointerId;
      suns[idx].x = x;
      suns[idx].y = y;
    }

    function onPointerMove(e: PointerEvent) {
      const suns = sunsRef.current;
      const held = suns.find((s) => s.pointerId === e.pointerId);
      if (!held) return;
      lastTouchRef.current = performance.now();
      const { x, y } = normPos(e.clientX, e.clientY);
      held.x = Math.max(0.04, Math.min(0.96, x));
      held.y = Math.max(0.06, Math.min(0.94, y));
    }

    function onPointerUp(e: PointerEvent) {
      const suns = sunsRef.current;
      const held = suns.find((s) => s.pointerId === e.pointerId);
      if (held) {
        held.pointerId = null;
        // Give it a gentle drift so it floats away rather than freezing.
        held.vx = (Math.random() - 0.5) * 0.03;
        held.vy = (Math.random() - 0.5) * 0.025;
      }
    }

    const c = canvas;
    c.addEventListener("pointerdown", onPointerDown);
    c.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
      c.removeEventListener("pointerdown", onPointerDown);
      c.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      rendererRef.current?.teardown();
      rendererRef.current = null;
      engineRef.current?.teardown();
      engineRef.current = null;
    };
  }, [started]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0a0a1c] touch-none select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Tap-to-begin: a big friendly glowing pulse, no text-gating to play. */}
      {!started && (
        <button
          onClick={startEverything}
          onPointerDown={startEverything}
          className="absolute inset-0 flex flex-col items-center justify-center gap-8"
          aria-label="Tap anywhere to begin"
        >
          <div className="flex items-center gap-10">
            <span className="block h-28 w-28 animate-ping rounded-full bg-violet-400/70" />
            <span className="block h-28 w-28 animate-ping rounded-full bg-violet-400/70 [animation-delay:600ms]" />
          </div>
          <span className="text-2xl font-light text-foreground">tap to wake the suns</span>
        </button>
      )}

      {/* WebGL2 unavailable notice (still fully playable on the Canvas2D fallback). */}
      {started && !webglOk && (
        <p className="absolute left-4 top-4 max-w-xs text-base text-violet-300">
          Your device can&apos;t use the glow shader, so this is the simpler
          light version. The music plays just the same.
        </p>
      )}

      {/* Quiet back-link — for the grown-up, not the child. */}
      <Link
        href="/dream"
        className="absolute bottom-4 right-4 text-base text-muted-foreground hover:text-foreground"
      >
        back
      </Link>
    </main>
  );
}
