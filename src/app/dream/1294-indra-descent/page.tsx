"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  makeSeed,
  packToMinRadius,
  packForView,
  pruneOffscreen,
  circleAt,
  bfsCascade,
  tangentPoint,
  runSelfCheck,
  type GasketState,
  type Circle,
  type ViewBox,
} from "./gasket";
import { startAudio, bendToFreq, type AudioEngine } from "./audio";
import { drawScene, rippleLifetime, type Camera, type Ripple } from "./render";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1294 · INDRA'S DESCENT
 *
 * What if an Apollonian circle-packing were a COUPLED instrument you fall through
 * forever? Strike one circle and its just-intonation pitch rings, then the tone
 * ripples OUTWARD along the tangent-neighbour graph — a decaying, self-similar
 * arpeggio cascading down the packing. Hold to "dive": the camera falls toward a
 * boundary tangent cusp and the gasket re-tiles infinitely into the gap, fresh
 * nesting streaming in as you descend. Sumi-e ink strokes; one vermilion accent
 * that races along the resonance edges. Cycle-2 deepening of 1285 + 1288.
 */

const HOLD_MS = 240; // press-and-hold before a still finger becomes a dive
const MAX_SCALE = 2.2e6;

export default function IndraDescentPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef<GasketState | null>(null);
  const camRef = useRef<Camera>({ scale: 300, cx: 0, cy: 0 });
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });

  const ripplesRef = useRef<Ripple[]>([]);
  const activityRef = useRef(0);
  const lastNowRef = useRef(0);
  const lastShimmerRef = useRef(0);
  const reaimTickRef = useRef(0);
  const pruneTickRef = useRef(0);

  // Pointer / gesture bookkeeping.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const downRef = useRef<{ x: number; y: number; t: number; moved: number } | null>(null);
  const pinchRef = useRef<number>(0);
  const divingRef = useRef(false);
  const diveTargetRef = useRef<{ x: number; y: number } | null>(null);

  const [audioOn, setAudioOn] = useState(false);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [diving, setDiving] = useState(false);
  const [count, setCount] = useState(0);

  // ── Seed + render loop (audio joins on Begin) ──
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

    // One-time console self-check: Descartes tangency + graph symmetry.
    try {
      const r = runSelfCheck(0.01, 1500);
      console.log(
        `[1294] self-check — circles:${r.circles} edges:${r.graphEdges} ` +
          `tangencyErr:${r.maxTangencyError.toExponential(2)} graphOK:${r.graphConsistent} ` +
          `seedBends:${r.seedBends.join(",")}`,
      );
    } catch {
      /* non-fatal */
    }

    const state = makeSeed(4200);
    packToMinRadius(state, reduced ? 0.02 : 0.012, 0);
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
      camRef.current.scale = Math.min(rect.width, rect.height) * 0.44;
    };
    applySize();

    const viewOf = (): ViewBox => ({
      scale: camRef.current.scale,
      cx: camRef.current.cx,
      cy: camRef.current.cy,
      w: sizeRef.current.w,
      h: sizeRef.current.h,
    });

    lastNowRef.current = performance.now();
    let frameTick = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const s = stateRef.current;
      if (!s) return;
      const now = performance.now();
      const dtSec = Math.min(0.05, Math.max(0, (now - lastNowRef.current) / 1000));
      lastNowRef.current = now;
      const cam = camRef.current;
      const reducedNow = reducedRef.current;
      const engine = audioRef.current;

      // ── Hold-to-dive: a still finger held past the threshold starts falling ──
      const d = downRef.current;
      if (d && !divingRef.current && pointersRef.current.size === 1) {
        if (d.moved < 10 && now - d.t > HOLD_MS) {
          const t = pickTangentTarget(s, cam, sizeRef.current, d.x, d.y);
          diveTargetRef.current = t;
          divingRef.current = true;
          setDiving(true);
        }
      }

      // ── The Möbius dive: fall toward a tangent cusp, re-tiling into the gap ──
      if (divingRef.current) {
        const tgt = diveTargetRef.current;
        if (tgt) {
          const speed = reducedNow ? 0.4 : 0.95;
          cam.scale = Math.min(MAX_SCALE, cam.scale * Math.exp(speed * dtSec));
          const ease = Math.min(1, (reducedNow ? 2 : 3.2) * dtSec);
          cam.cx += (tgt.x - cam.cx) * ease;
          cam.cy += (tgt.y - cam.cy) * ease;
        }
        // Re-aim down the funnel toward the deepest cusp near centre.
        reaimTickRef.current++;
        if (reaimTickRef.current > 26) {
          reaimTickRef.current = 0;
          const re = pickTangentTarget(s, cam, sizeRef.current, sizeRef.current.w / 2, sizeRef.current.h / 2);
          if (re) diveTargetRef.current = re;
        }
        // Recycle ballooned ancestors so the descent never runs out of nesting.
        pruneTickRef.current++;
        if (pruneTickRef.current > 20) {
          pruneTickRef.current = 0;
          pruneOffscreen(s, viewOf());
        }
      }

      // ── Lazily stream fresh nesting into the viewport (heart of "infinite") ──
      const minPx = reducedNow ? 2.4 : 1.6;
      const born = packForView(s, viewOf(), minPx, divingRef.current ? (reducedNow ? 5 : 11) : 6, now);

      // Newborns glitter as you dive — ties the fall to sound.
      if (divingRef.current && engine && born.length && now - lastShimmerRef.current > 150) {
        lastShimmerRef.current = now;
        let big = born[0];
        for (const c of born) if (c.r > big.r) big = c;
        engine.strike(bendToFreq(big.b), 0.45, sizeOf(big), engine.now() + 0.01);
        activityRef.current = Math.min(1, activityRef.current + 0.05);
      }

      // Drone bed follows activity, relaxing between flurries.
      activityRef.current = Math.max(0, activityRef.current - dtSec * 0.4);
      if (engine) engine.swell(activityRef.current);

      // Expire finished ripples.
      if (ripplesRef.current.length) {
        ripplesRef.current = ripplesRef.current.filter(
          (rip) => now - rip.startMs < rippleLifetime(rip),
        );
      }

      drawScene(
        ctx,
        s,
        cam,
        sizeRef.current,
        reducedNow,
        now,
        ripplesRef.current,
        divingRef.current ? diveTargetRef.current : null,
      );

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
      // Ring a resting chord straight from the central packing as a payoff.
      const s = stateRef.current;
      if (s) {
        const c = circleAt(s, camRef.current.cx, camRef.current.cy);
        if (c) fireCascade(s, engine, c.id, ripplesRef.current, activityRef);
      }
    } catch {
      setAudioOn(false);
    }
  }, []);

  // ── Strike: ring the circle + cascade along the tangency graph ──
  const strikeAt = useCallback((sx: number, sy: number) => {
    const s = stateRef.current;
    if (!s) return;
    const cam = camRef.current;
    const { w, h } = sizeRef.current;
    const wx = cam.cx + (sx - w / 2) / cam.scale;
    const wy = cam.cy + (sy - h / 2) / cam.scale;
    const hit = circleAt(s, wx, wy);
    if (!hit) return;
    const engine = audioRef.current;
    if (engine) fireCascade(s, engine, hit.id, ripplesRef.current, activityRef);
    else {
      // No audio: still show the visual ripple.
      const arrivals = bfsCascade(s, hit.id, {
        maxHops: reducedRef.current ? 4 : 5,
        maxNodes: 30,
        hopMs: 115,
        decay: 0.62,
        branch: 4,
      });
      ripplesRef.current.push({ arrivals, startMs: performance.now() });
    }
  }, []);

  // ── Pointer handling: tap = strike, hold = dive, drag = pan, pinch = zoom ──
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
      downRef.current = null;
      if (divingRef.current) {
        divingRef.current = false;
        setDiving(false);
      }
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
      const pts = [...ptrs.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      if (pinchRef.current > 0) applyZoom(cam, sizeRef.current, dist / pinchRef.current, mx, my);
      pinchRef.current = dist;
      return;
    }

    if (downRef.current) downRef.current.moved += Math.hypot(dx, dy);
    // A single finger only pans once it's clearly a drag (and not a dive).
    if (!divingRef.current && downRef.current && downRef.current.moved > 10) {
      cam.cx -= dx / cam.scale;
      cam.cy -= dy / cam.scale;
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      const down = downRef.current;
      const wasLast = pointersRef.current.size === 1;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = 0;

      if (divingRef.current) {
        divingRef.current = false;
        setDiving(false);
      } else if (wasLast && down) {
        const dt = performance.now() - down.t;
        if (down.moved < 8 && dt < HOLD_MS) {
          const [x, y] = localXY(e);
          strikeAt(x, y);
        }
      }
      downRef.current = null;
    },
    [strikeAt],
  );

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0016);
    applyZoom(camRef.current, sizeRef.current, factor, x, y);
  }, []);

  // Dedicated press-and-hold Descend control (targets the central cusp).
  const startCentreDive = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const { w, h } = sizeRef.current;
    diveTargetRef.current = pickTangentTarget(s, camRef.current, sizeRef.current, w / 2, h / 2);
    divingRef.current = true;
    setDiving(true);
  }, []);

  const stopDive = useCallback(() => {
    divingRef.current = false;
    setDiving(false);
  }, []);

  const resetView = useCallback(() => {
    const { w, h } = sizeRef.current;
    camRef.current = { scale: Math.min(w, h) * 0.44, cx: 0, cy: 0 };
    stopDive();
  }, [stopDive]);

  const reseed = useCallback(() => {
    const reduced = reducedRef.current;
    const state = makeSeed(4200);
    packToMinRadius(state, reduced ? 0.02 : 0.012, 0);
    stateRef.current = state;
    ripplesRef.current = [];
    resetView();
    setCount(state.circles.length);
  }, [resetView]);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#060608]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl font-bold text-foreground">Indra&apos;s Descent</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:text-foreground"
            >
              {showNotes ? "close notes" : "read the design notes"}
            </button>
            <Link
              href="/dream"
              className="flex min-h-[44px] items-center px-2 font-mono text-base text-muted-foreground transition hover:text-foreground"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          Strike a circle: its just-intonation pitch rings, then the tone ripples outward
          along the tangent-neighbour graph — a decaying, self-similar arpeggio cascading
          down the packing. Hold anywhere to <em>dive</em>, and the gasket re-tiles
          infinitely into the cusp you fall toward.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-muted-foreground ring-1 ring-border backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-foreground">The question:</strong> what if the Apollonian
            gasket were a <em>coupled</em> instrument you fall through forever — each circle
            a just-intonation voice wired to its tangent neighbours, so one strike unfolds a
            chord rippling down the packing while a Möbius dive slides you into infinite
            nesting?
          </p>
          <p className="mb-2">
            <strong className="text-foreground">The math:</strong> circles are a signed bend{" "}
            <span className="text-[#e0402f]">b = ±1/r</span> and a complex centre; every child
            is placed by the <span className="text-[#e0402f]">Descartes Circle Theorem</span>{" "}
            (<em>b₄ = b₁+b₂+b₃ ± 2√(b₁b₂+b₂b₃+b₃b₁)</em>) and its complex companion for the
            centre. As each child is inscribed we record its <em>exact</em> tangencies —
            building the graph a strike propagates along. The dive is a Möbius dilation toward
            a boundary tangent cusp; self-similarity means the same structure recurs at every
            scale, so the descent never bottoms out — fresh circles stream in wherever the
            camera falls.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Played:</strong> tap a circle to sound it
            (bend → pitch, quantised to a 5-limit just scale); the tone hops outward along
            tangent edges, each hop ~115&nbsp;ms later and ~0.6× quieter, up to five hops — a
            vermilion wave racing the resonance. Hold to fall; drag to pan; scroll or pinch to
            zoom. A low root+fifth drone bed underpins it all.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Altered states:</strong> the endless
            self-similar regress evokes the fractal / tunnel phenomenology of the Klüver form
            constants — a felt fall into infinite nesting, driven purely by the geometry. No
            strobe: newborn circles ease in, and the ripple is a smooth travelling highlight.
            Respects <em>prefers-reduced-motion</em>.
          </p>
          <p className="text-muted-foreground">
            Refs: Descartes (1643); Soddy, &ldquo;The Kiss Precise,&rdquo; <em>Nature</em> (1936);
            Mumford, Series &amp; Wright, <em>Indra&apos;s Pearls: The Vision of Felix Klein</em>{" "}
            (2002); Klüver, <em>Mescal and Mechanisms of Hallucinations</em> (1966). Cycle-2
            deepening of 1285 (apollonian-gasket) &amp; 1288 (gasket-cathedral). Not verified
            on real hardware/ears.
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
            <p className="max-w-md text-center text-base text-violet-300">
              Canvas 2D is unavailable in this browser, so the gasket can&apos;t be drawn. Try
              a current desktop or mobile browser.
            </p>
          </div>
        )}

        {/* Live readout */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-foreground ring-1 ring-border backdrop-blur-sm">
          <div className="text-[#f0705f]">circles ≈ {count}</div>
          <div className="text-muted-foreground">tap = strike + cascade · hold = dive · drag = pan</div>
        </div>

        {/* View controls */}
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              startCentreDive();
            }}
            onPointerUp={stopDive}
            onPointerLeave={stopDive}
            onPointerCancel={stopDive}
            className={`min-h-[44px] select-none rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
              diving
                ? "bg-[#e0402f]/90 text-foreground ring-[#e0402f]"
                : "text-muted-foreground ring-border hover:bg-accent hover:text-foreground"
            }`}
          >
            {diving ? "descending…" : "hold to descend ▾"}
          </button>
          <button
            type="button"
            onClick={resetView}
            className="min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent hover:text-foreground"
          >
            reset
          </button>
          <button
            type="button"
            onClick={reseed}
            className="min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent hover:text-foreground"
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
              className="min-h-[44px] rounded-full bg-[#e0402f]/90 px-4 py-2.5 font-mono text-base font-semibold text-foreground ring-1 ring-[#e0402f]/50 transition hover:bg-[#e0402f]"
            >
              ▶ Begin — ring the packing
            </button>
            <p className="text-base text-muted-foreground">
              The gasket is already drawn and silent — Begin lets each circle resonate.
            </p>
          </div>
        )}

        {audioOn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <p className="text-base text-muted-foreground">
              Tap to strike a cascade · hold anywhere (or the button) to fall toward the cusp.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Helpers (never named use*) ───────────────────────────────────────────────

/** Perceptual size 0..1 from a circle's bend (big circle → ~1). */
function sizeOf(c: Circle): number {
  return Math.max(0.1, Math.min(1, 1 - Math.log2(Math.max(2, Math.abs(c.b)) / 2) / 8));
}

/** Run one tangency-graph cascade: schedule every arrival on the audio engine and
 *  register the visual ripple. Shared by Begin, tap, and the payoff chord. */
function fireCascade(
  state: GasketState,
  engine: AudioEngine,
  startId: number,
  ripples: Ripple[],
  activityRef: { current: number },
): void {
  const arrivals = bfsCascade(state, startId, {
    maxHops: 5,
    maxNodes: 30,
    hopMs: 115,
    decay: 0.62,
    branch: 4,
  });
  const base = engine.now();
  for (const arr of arrivals) {
    const c = state.byId.get(arr.id);
    if (!c) continue;
    engine.strike(bendToFreq(c.b), arr.amp, sizeOf(c), base + arr.delayMs / 1000);
  }
  ripples.push({ arrivals, startMs: performance.now() });
  activityRef.current = Math.min(1, activityRef.current + 0.2);
}

/** Zoom by `factor` keeping the world point under (sx,sy) fixed. */
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
  cam.scale = Math.max(60, Math.min(MAX_SCALE, cam.scale * factor));
  cam.cx = wx - (sx - w / 2) / cam.scale;
  cam.cy = wy - (sy - h / 2) / cam.scale;
}

/** Pick the tangent cusp to fall into: the tangent point of an on-screen edge
 *  nearest the aim point, biased toward deeper (smaller) circles. */
function pickTangentTarget(
  state: GasketState,
  cam: Camera,
  size: { w: number; h: number },
  sx: number,
  sy: number,
): { x: number; y: number } | null {
  const { w, h } = size;
  const wx = cam.cx + (sx - w / 2) / cam.scale;
  const wy = cam.cy + (sy - h / 2) / cam.scale;
  const maxRs = Math.max(w, h) * 0.9;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const c of state.circles) {
    if (c.b < 0) continue;
    const rs = c.r * cam.scale;
    if (rs < 3 || rs > maxRs) continue;
    for (const nId of c.neighbors) {
      if (nId < c.id) continue; // visit each edge once
      const n = state.byId.get(nId);
      if (!n || n.b < 0) continue;
      const tp = tangentPoint(c, n);
      const d = Math.hypot(tp.x - wx, tp.y - wy);
      const score = d + 0.18 * (c.r + n.r); // prefer near + deep
      if (score < bestScore) {
        bestScore = score;
        best = tp;
      }
    }
  }
  return best ?? { x: wx, y: wy };
}
