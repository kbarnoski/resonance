"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  makeSeed,
  packToMinRadius,
  packAround,
  circleAt,
  runSelfCheck,
  type GasketState,
  type Circle,
} from "./gasket";
import { startAudio, type AudioEngine } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1285 · APOLLONIAN GASKET
 *
 * What if you could PLAY the Apollonian gasket — tap a circle to sound its tone
 * and grow tangent children into the gap beneath your finger, packing an
 * infinite self-similar fractal you compose by ear? Circles are signed-curvature
 * + complex-centre records; every child is placed by the Descartes Circle Theorem
 * (and its complex form for the centre). A circle's bend maps to pitch — bigger
 * circles sound lower — quantised to a just-intonation pentatonic, so packing the
 * gasket literally builds a chord. Nacre rings on deep ink; drone bed underneath.
 */

interface Camera {
  scale: number; // world units → px
  cx: number; // world x at viewport centre
  cy: number;
}

const GROW_MS = 750;

export default function ApollonianGasketPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef<GasketState | null>(null);
  const camRef = useRef<Camera>({ scale: 300, cx: 0, cy: 0 });
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });

  // Pointer bookkeeping for tap / pan / pinch.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const downRef = useRef<{ x: number; y: number; t: number; moved: number } | null>(null);
  const pinchRef = useRef<number>(0);

  const [audioOn, setAudioOn] = useState(false);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [count, setCount] = useState(0);

  // ── Build seed + run the render loop (audio joins on Begin) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNoCanvas(true);
      return;
    }

    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;

    // One-time console self-check confirming Descartes tangency + termination.
    try {
      const r = runSelfCheck(0.01, 1500);
      console.log(
        `[1285] gasket self-check — circles:${r.circles} tangencyErr:${r.maxTangencyError.toExponential(
          2,
        )} terminated:${r.terminated} seedBends:${r.seedBends.join(",")}`,
      );
    } catch {
      /* non-fatal */
    }

    // Seed: a handful of levels already packed, so the image + chord read at a
    // glance. All seed circles share birth 0 → drawn full-size immediately.
    const state = makeSeed(3200);
    packToMinRadius(state, reduced ? 0.03 : 0.018, 0);
    stateRef.current = state;
    setCount(state.circles.length);

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      // Fit the outer (radius-1) circle to ~44% of the smaller side.
      camRef.current.scale = Math.min(rect.width, rect.height) * 0.44;
    };
    applySize();

    let frameTick = 0;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s) return;
      drawScene(ctx, s, camRef.current, sizeRef.current, reducedRef.current, performance.now());
      frameTick++;
      if (frameTick >= 15) {
        frameTick = 0;
        setCount(s.circles.length);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const ro = new ResizeObserver(applySize);
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      stateRef.current = null;
    };
  }, []);

  // ── Audio teardown on unmount ──
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const engine = await startAudio();
      audioRef.current = engine;
      setAudioOn(true);
      // Sound the resting root chord immediately so Begin has a payoff.
      const s = stateRef.current;
      if (s) {
        const seeds = s.circles.filter((c) => c.b > 0 && c.depth === 0).slice(0, 4);
        seeds.forEach((c, i) => {
          setTimeout(() => audioRef.current?.strike(c.b, sizeOf(c)), i * 140);
        });
      }
    } catch {
      setAudioOn(false);
    }
  }, []);

  // ── Tap: sound the circle under the finger + pack its gaps with children ──
  const tapAt = useCallback((sx: number, sy: number) => {
    const s = stateRef.current;
    if (!s) return;
    const cam = camRef.current;
    const { w, h } = sizeRef.current;
    const wx = cam.cx + (sx - w / 2) / cam.scale;
    const wy = cam.cy + (sy - h / 2) / cam.scale;

    const hit = circleAt(s, wx, wy);
    const now = performance.now();

    // Sound the tapped circle's own tone (curvature → pitch).
    if (audioRef.current && hit) audioRef.current.strike(hit.b, sizeOf(hit));

    // Grow the next generation into the gaps beneath the finger. Screen-space
    // radius floor keeps children from ever spawning sub-pixel.
    const screenFloor = 1.6 / cam.scale;
    const worldFloor = reducedRef.current ? 0.004 : 0.0022;
    const minR = Math.max(worldFloor, screenFloor);
    const reach = hit ? hit.r * 1.15 : 0.12 / cam.scale + 0.05;
    const born = packAround(s, wx, wy, reach, minR, now, reducedRef.current ? 10 : 20);

    // Sound the largest few newborns so a tap chimes a small chord.
    if (audioRef.current && born.length) {
      const chord = [...born].sort((a, b) => b.r - a.r).slice(0, 6);
      chord.forEach((c, i) => {
        setTimeout(() => audioRef.current?.strike(c.b, sizeOf(c)), 40 + i * 55);
      });
    }
    setCount(s.circles.length);
  }, []);

  // ── Pointer handling: single = tap/pan, double = pinch-zoom ──
  const localXY = (e: React.PointerEvent): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = localXY(e);
    pointersRef.current.set(e.pointerId, { x, y });
    if (pointersRef.current.size === 1) {
      downRef.current = { x, y, t: performance.now(), moved: 0 };
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      downRef.current = null; // two fingers → not a tap
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const ptrs = pointersRef.current;
    if (!ptrs.has(e.pointerId)) return;
    const [x, y] = localXY(e);
    const prev = ptrs.get(e.pointerId)!;
    const dx = x - prev.x;
    const dy = y - prev.y;
    ptrs.set(e.pointerId, { x, y });

    const cam = camRef.current;
    if (ptrs.size >= 2) {
      // Pinch-zoom about the midpoint.
      const pts = [...ptrs.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      if (pinchRef.current > 0) applyZoom(cam, sizeRef.current, dist / pinchRef.current, mx, my);
      pinchRef.current = dist;
      return;
    }
    // Single pointer: pan, and accumulate movement to distinguish tap from drag.
    cam.cx -= dx / cam.scale;
    cam.cy -= dy / cam.scale;
    if (downRef.current) downRef.current.moved += Math.hypot(dx, dy);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const down = downRef.current;
      const wasLast = pointersRef.current.size === 1;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = 0;
      if (wasLast && down) {
        const dt = performance.now() - down.t;
        if (down.moved < 8 && dt < 400) {
          const [x, y] = localXY(e);
          tapAt(x, y);
        }
      }
      downRef.current = null;
    },
    [tapAt],
  );

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const [x, y] = [
      e.clientX - e.currentTarget.getBoundingClientRect().left,
      e.clientY - e.currentTarget.getBoundingClientRect().top,
    ];
    const factor = Math.exp(-e.deltaY * 0.0016);
    applyZoom(camRef.current, sizeRef.current, factor, x, y);
  }, []);

  const resetView = useCallback(() => {
    const { w, h } = sizeRef.current;
    camRef.current = { scale: Math.min(w, h) * 0.44, cx: 0, cy: 0 };
  }, []);

  const reseed = useCallback(() => {
    const reduced = reducedRef.current;
    const state = makeSeed(3200);
    packToMinRadius(state, reduced ? 0.03 : 0.018, 0);
    stateRef.current = state;
    resetView();
    setCount(state.circles.length);
  }, [resetView]);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#05060a]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-white">Apollonian Gasket</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-white/75 ring-1 ring-white/15 transition hover:text-white"
            >
              {showNotes ? "close notes" : "read the design notes"}
            </button>
            <Link
              href="/dream"
              className="flex min-h-[44px] items-center px-2 font-mono text-base text-white/60 transition hover:text-white/90"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-base text-white/75">
          Tap a circle to sound its tone and grow tangent children into the gap beneath
          your finger — packing an infinite, self-similar fractal you compose by ear. A
          circle&apos;s curvature is its pitch: bigger rings ring lower, and every tap
          harmonises.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-white/75 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-white/95">The question:</strong> what if the
            Apollonian gasket were an <em>instrument</em> — each circle a just-intonation
            voice, packing it by ear until an infinite chord condenses out of the gaps?
          </p>
          <p className="mb-2">
            <strong className="text-white/95">The math:</strong> circles are stored as a
            signed curvature (bend) <span className="text-violet-300">b = ±1/r</span> and a
            complex centre. Each new tangent circle is placed by the{" "}
            <span className="text-violet-300">Descartes Circle Theorem</span> —{" "}
            <em>b₄ = b₁+b₂+b₃ ± 2√(b₁b₂+b₂b₃+b₃b₁)</em> — and its complex companion for
            the centre. The circle inscribed in a curvilinear triangular gap is the
            larger-bend solution; placing it splits the gap into three, and the packing
            recurses toward the infinite-nesting limit (capped by a minimum radius and a
            count ceiling). A console self-check confirms every child is mutually tangent
            to its three parents to ~1e-15.
          </p>
          <p className="mb-2">
            <strong className="text-white/95">Played:</strong> tap anywhere — the circle
            under your finger sounds (curvature → pitch, quantised to a 5-limit JI
            pentatonic so taps harmonise), and its neighbouring gaps grow their next
            generation of tangent children, each chiming higher and quieter. Drag to pan,
            pinch or scroll to dive toward the limit. A low root+fifth drone bed ties the
            chord together.
          </p>
          <p className="mb-2">
            <strong className="text-white/95">Altered states:</strong> the endless
            self-similar nesting evokes the fractal-regress phenomenology of the Klüver
            form constants (tunnels, honeycomb, cobweb) — drug-free, driven only by the
            geometry. All luminance change is slow drift; there is no strobe.
          </p>
          <p className="text-white/60">
            Refs: Descartes (1643); Apollonius of Perga, <em>Tangencies</em>; Soddy, &ldquo;The
            Kiss Precise,&rdquo; <em>Nature</em> (1936); Mumford, Series &amp; Wright,{" "}
            <em>Indra&apos;s Pearls</em> (2002); Klüver, <em>Mescal and Mechanisms of
            Hallucinations</em> (1966). Not verified on real hardware/ears.
          </p>
        </div>
      )}

      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />

        {noCanvas && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
            <p className="max-w-md text-center text-base text-rose-300">
              Canvas 2D is unavailable in this browser, so the gasket can&apos;t be drawn.
              Try a current desktop or mobile browser.
            </p>
          </div>
        )}

        {/* Live readout */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-white/80 ring-1 ring-white/10 backdrop-blur-sm">
          <div className="text-violet-300">circles ≈ {count}</div>
          <div className="text-white/60">tap = sound + pack · drag = pan · scroll = zoom</div>
        </div>

        {/* View controls */}
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          <button
            type="button"
            onClick={resetView}
            className="min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 hover:text-white"
          >
            reset view
          </button>
          <button
            type="button"
            onClick={reseed}
            className="min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base text-white/70 ring-1 ring-white/15 transition hover:bg-white/10 hover:text-white"
          >
            reseed
          </button>
        </div>

        {/* Begin (audio gate) */}
        {!audioOn && !noCanvas && (
          <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-300/90 px-4 py-2.5 font-mono text-base font-semibold text-black ring-1 ring-violet-200/40 transition hover:bg-violet-200"
            >
              ▶ Begin — sound the gasket
            </button>
            <p className="text-base text-white/60">
              The packing is already alive and silent — Begin lets each circle ring.
            </p>
          </div>
        )}

        {audioOn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <p className="text-base text-white/55">
              Tap to pack and sound · pinch or scroll to dive toward the limit.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Helpers (never named use*) ───────────────────────────────────────────────

/** Perceptual size 0..1 from a circle's bend (big circle → ~1). Drives voice
 *  loudness/length and ring brightness. */
function sizeOf(c: Circle): number {
  return Math.max(0.12, Math.min(1, 1 - Math.log2(Math.max(2, Math.abs(c.b)) / 2) / 7));
}

/** Zoom the camera by `factor` while keeping the world point under (sx,sy) fixed. */
function applyZoom(
  cam: Camera,
  size: { w: number; h: number },
  factor: number,
  sx: number,
  sy: number,
): void {
  const { w, h } = size;
  const wx = cam.cx + (sx - w / 2) / cam.scale;
  const wy = cam.cy + (sy - h / 2) / cam.scale;
  cam.scale = Math.max(60, Math.min(4_000_000, cam.scale * factor));
  cam.cx = wx - (sx - w / 2) / cam.scale;
  cam.cy = wy - (sy - h / 2) / cam.scale;
}

/** Draw the whole gasket as luminous nacre rings on deep ink. */
function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GasketState,
  cam: Camera,
  size: { w: number; h: number; dpr: number },
  reduced: boolean,
  nowMs: number,
): void {
  const { w, h, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Deep-ink base with a faint central bloom (not a full filled field).
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, w, h);
  const vign = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  vign.addColorStop(0, "rgba(60,70,110,0.10)");
  vign.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, w, h);

  // Slow global luminance drift — a breath, never a flash. Steady when reduced.
  const drift = reduced ? 1 : 0.86 + 0.14 * Math.sin(nowMs * 0.00045);

  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";

  const cxs = w / 2;
  const cys = h / 2;
  const margin = 40;

  for (const c of state.circles) {
    const rs = c.r * cam.scale;
    if (rs < 0.5) continue; // sub-pixel — skip
    const sx = cxs + (c.x - cam.cx) * cam.scale;
    const sy = cys + (c.y - cam.cy) * cam.scale;
    // Cull anything fully off-screen.
    if (sx + rs < -margin || sx - rs > w + margin || sy + rs < -margin || sy - rs > h + margin)
      continue;

    // Grow-in animation for freshly packed circles.
    let grow = 1;
    if (c.birth > 0) {
      const age = (nowMs - c.birth) / (reduced ? 200 : GROW_MS);
      if (age < 1) {
        const e = 1 - Math.pow(1 - Math.max(0, age), 3);
        grow = e;
      }
    }
    const rDraw = rs * grow;
    if (rDraw < 0.5) continue;

    // Mother-of-pearl: pale, low-saturation hue that shifts with depth + a slow
    // global phase, so the packing shimmers iridescent rather than glowing hot.
    const hue = (196 + c.depth * 26 + nowMs * 0.004) % 360;
    const isOuter = c.b < 0;
    const sz = sizeOf(c);
    // Bigger rings brighter/thicker; a fresh circle flares softly then settles.
    const freshFlare = c.birth > 0 && grow < 1 ? 0.5 * (1 - grow) : 0;
    const alpha = Math.min(0.9, (isOuter ? 0.32 : 0.2 + 0.42 * sz) + freshFlare) * drift;
    const light = 74 + 14 * sz;
    const sat = isOuter ? 12 : 30 + 16 * sz;
    const lw = Math.max(0.5, Math.min(1.9, (isOuter ? 1.4 : 0.7 + 1.2 * sz)));

    ctx.beginPath();
    ctx.arc(sx, sy, rDraw, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${alpha.toFixed(3)})`;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
}
