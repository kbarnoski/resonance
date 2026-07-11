"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1440-thread-scan — "Thread Scan"
//
//   Under ego / boundary dissolution the visual field stops being separate
//   objects and becomes ONE continuous woven thread. A Hilbert space-filling
//   curve is exactly that: a single unbroken line that visits every cell of a
//   plane while preserving locality — it weaves a 2-D field into one 1-D thread.
//
//   Paint luminous marks into a dark field; a bright reading-head travels the
//   Hilbert thread and SOUNDS whatever it passes. Because the curve preserves
//   locality, a shape you paint becomes a coherent gesture, and the whole field
//   is audibly one connected line. Pitch is a CONTINUOUS glissando mapped from
//   the head's vertical position — a woven continuum, not a scale.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { buildHilbert, headAt, type HilbertCurve } from "./hilbert";
import { PaintField } from "./field";
import { ThreadRenderer, type Tier, type DrawState } from "./renderer";
import { ThreadAudio } from "./audio";

type Phase = "idle" | "running";

const TRAIL_MAX = 40;
const nowSec = () => performance.now() / 1000;
const hueFor = (ny: number) => 0.72 - Math.min(1, Math.max(0, ny)) * 0.62;

export default function ThreadScanPage() {
  const field = useMemo(() => {
    const f = new PaintField();
    f.prePaintGlyph();
    return f;
  }, []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ThreadRenderer | null>(null);
  const audioRef = useRef<ThreadAudio | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const curveRef = useRef<HilbertCurve>(buildHilbert(5));
  const headRef = useRef<number>(0); // fractional index along the thread
  const trailRef = useRef<Float32Array>(new Float32Array(TRAIL_MAX * 2));
  const trailLenRef = useRef<number>(0);

  // live params mirrored into refs so the rAF loop never goes stale
  const orderRef = useRef(5);
  const speedRef = useRef(0.42);
  const letGoRef = useRef(true);
  const scrubRef = useRef(0);
  const reducedRef = useRef(false);
  const runningRef = useRef(false);
  const paintDownRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tier, setTier] = useState<Tier | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [order, setOrder] = useState(5);
  const [speed, setSpeed] = useState(0.42);
  const [letGo, setLetGo] = useState(true);
  const [scrub, setScrub] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  // ── the animation loop (runs from mount for the idle self-demo) ─────────────
  const frame = useCallback(() => {
    const r = rendererRef.current;
    const canvas = canvasRef.current;
    if (!r || !canvas) return;

    const t = nowSec();
    let dt = t - lastRef.current;
    if (dt < 0 || dt > 0.1) dt = 0.016;
    lastRef.current = t;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    r.resize(canvas.clientWidth || 1, canvas.clientHeight || 1, dpr);

    const curve = curveRef.current;
    const reduced = reducedRef.current;

    // advance / steer the head
    if (letGoRef.current) {
      const traverse = reduced ? 30 : 18; // seconds for a full thread at speed 1
      const cellsPerSec = (speedRef.current * curve.count) / traverse;
      headRef.current = headRef.current + cellsPerSec * dt;
    } else {
      headRef.current = scrubRef.current * (curve.count - 1);
    }

    const { fx, fy } = headAt(curve, headRef.current);

    // push into the trail ring (as a compact growing buffer, newest last)
    const trail = trailRef.current;
    let len = trailLenRef.current;
    if (len < TRAIL_MAX) {
      trail[len * 2] = fx;
      trail[len * 2 + 1] = fy;
      len += 1;
      trailLenRef.current = len;
    } else {
      trail.copyWithin(0, 2);
      trail[(TRAIL_MAX - 1) * 2] = fx;
      trail[(TRAIL_MAX - 1) * 2 + 1] = fy;
    }

    // breathing — a slow, safe (~0.12 Hz) luminance drift
    const breathDepth = reduced ? 0.05 : 0.12;
    const breath = 1 + breathDepth * Math.sin(t * 2 * Math.PI * 0.12);

    const intensity = Math.min(
      1,
      (orderRef.current - 3) / 3 * 0.5 + speedRef.current * 0.5,
    );

    const state: DrawState = {
      headX: fx,
      headY: fy,
      trail,
      trailLen: trailLenRef.current,
      breath,
      intensity,
    };
    r.draw(state);

    // audio (only once running)
    const a = audioRef.current;
    if (a && runningRef.current) {
      const s = field.sample(fx, fy);
      a.update(
        { fx, fy, bri: s.bri, hue: s.hue, density: s.density },
        breath,
        true,
      );
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [field]);

  // mount renderer + start the visual idle demo
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: ThreadRenderer;
    try {
      renderer = new ThreadRenderer(canvas, field);
    } catch (e) {
      setGlError(String(e));
      return;
    }
    rendererRef.current = renderer;
    renderer.setCurve(curveRef.current);
    setTier(renderer.tier);
    if (renderer.tier === "canvas2d") {
      setGlError(
        "WebGL2 unavailable — running the reduced Canvas2D fallback. Sound still plays.",
      );
    }
    lastRef.current = nowSec();
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      audioRef.current?.close();
      audioRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [field, frame]);

  // ── order changes rebuild the thread (weave finer/coarser) ──────────────────
  const applyOrder = useCallback((o: number) => {
    const prev = curveRef.current;
    const u = prev.count > 1 ? headRef.current / (prev.count - 1) : 0;
    const curve = buildHilbert(o);
    curveRef.current = curve;
    orderRef.current = o;
    headRef.current = Math.min(curve.count - 1, u * (curve.count - 1));
    trailLenRef.current = 0;
    rendererRef.current?.setCurve(curve);
    setOrder(o);
  }, []);

  // ── begin (gesture-gated audio) ─────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    if (runningRef.current) return;
    const audio = new ThreadAudio();
    audioRef.current = audio;
    await audio.resume();
    runningRef.current = true;
    setPhase("running");
  }, []);

  // ── painting ────────────────────────────────────────────────────────────────
  const paintAt = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      field.paint(nx, ny, hueFor(ny), 0.045, 0.85);
    },
    [field],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "running") return;
      paintDownRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      paintAt(e);
    },
    [phase, paintAt],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!paintDownRef.current) return;
      paintAt(e);
    },
    [paintAt],
  );
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    paintDownRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // keep param refs in sync
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    letGoRef.current = letGo;
  }, [letGo]);
  useEffect(() => {
    scrubRef.current = scrub;
  }, [scrub]);

  const ctrl =
    "min-h-[44px] rounded-full border border-white/15 bg-black/50 px-4 py-2.5 text-sm text-white/75 transition-colors hover:text-white hover:bg-white/[0.08]";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="font-serif text-2xl tracking-tight text-white/95 sm:text-3xl">
          Thread Scan
        </h1>
        <p className="mt-1 max-w-xl text-base text-white/75">
          One unbroken thread weaves the whole field into a single line of light
          and pitch.
        </p>
      </div>

      {/* tier badge */}
      {tier && (
        <div className="pointer-events-none absolute right-4 top-5 z-20 sm:right-6">
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
              tier === "webgl2"
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/40 bg-amber-400/10 text-amber-300"
            }`}
          >
            {tier === "webgl2" ? "WebGL2" : "Canvas2D"}
          </span>
        </div>
      )}

      {glError && tier === "canvas2d" && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
          <p className="max-w-md rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-center text-sm text-rose-300">
            {glError}
          </p>
        </div>
      )}

      {/* controls */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-16 z-20 flex flex-wrap items-center justify-center gap-2 px-4 sm:gap-3">
          <div className="flex items-center gap-1 rounded-full border border-white/12 bg-black/60 p-1 backdrop-blur-md">
            {[3, 4, 5, 6].map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => applyOrder(o)}
                className={`min-h-[44px] min-w-[44px] rounded-full px-3 py-2 font-mono text-sm transition-colors ${
                  order === o
                    ? "bg-violet-500/25 text-violet-200"
                    : "text-white/55 hover:text-white"
                }`}
                title={`Hilbert order ${o} — ${1 << o}×${1 << o} cells`}
              >
                {o}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-full border border-white/12 bg-black/60 px-4 py-2.5 backdrop-blur-md">
            <span className="font-mono text-xs text-white/55">speed</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="h-1 w-24 accent-violet-400"
            />
          </label>

          <button
            type="button"
            onClick={() => setLetGo((v) => !v)}
            className={`${ctrl} ${letGo ? "border-violet-400/40 bg-violet-500/20 text-violet-200" : ""}`}
            title="Let the head travel on its own, or hold it and scrub"
          >
            {letGo ? "let go ✓" : "let go"}
          </button>

          {!letGo && (
            <label className="flex items-center gap-2 rounded-full border border-white/12 bg-black/60 px-4 py-2.5 backdrop-blur-md">
              <span className="font-mono text-xs text-white/55">scrub</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={scrub}
                onChange={(e) => setScrub(parseFloat(e.target.value))}
                className="h-1 w-32 accent-violet-400"
              />
            </label>
          )}

          <button type="button" onClick={() => field.clear()} className={ctrl}>
            clear field
          </button>
        </div>
      )}

      {/* live hint */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 text-center">
          <p className="text-sm text-white/55">
            drag on the field to paint · the thread reads what you paint
          </p>
        </div>
      )}

      {/* gesture gate — the glyph is already weaving behind it */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div className="mx-6 max-w-md rounded-2xl border border-white/12 bg-black/70 p-6 text-center backdrop-blur-md">
            <p className="text-base text-white/75">
              A single Hilbert thread is already tracing the field into music.
              Turn on the sound, then paint your own marks for it to read.
            </p>
            <button
              type="button"
              onClick={handleBegin}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-semibold text-white transition-colors hover:bg-violet-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              Begin — sound on
            </button>
            <p className="mt-4 font-mono text-sm text-white/55">
              drag = paint · order = weave · let go = it travels alone
            </p>
          </div>
        </div>
      )}

      {/* design notes */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-3 left-3 z-30 min-h-[44px] rounded-full border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white/75 transition-colors hover:text-white"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-16 left-3 z-30 max-w-sm rounded-2xl border border-white/12 bg-black/85 p-4 text-sm leading-relaxed text-white/75 backdrop-blur-md">
          <p className="text-base font-semibold text-white/95">One woven line</p>
          <p className="mt-2">
            A <span className="text-violet-300">Hilbert space-filling curve</span>{" "}
            (Hilbert 1891) is one unbroken line that visits every cell of the
            field while preserving locality — marks near each other in space are
            near each other in time, so a shape becomes a coherent gesture and the
            whole field is audibly <em>one thread</em>.
          </p>
          <p className="mt-2 text-white/75">
            Pitch is a <span className="text-violet-300">continuous glissando</span>{" "}
            from the head&apos;s vertical position — a woven continuum, deliberately
            not a scale. Brightness → loudness, hue → timbre, density → shimmer.
          </p>
          <p className="mt-2 text-white/55">
            Higher order &amp; speed = a finer, faster, more intense weave
            (ego-dissolution&apos;s hyperconnected unified field; Carhart-Harris,
            entropic brain / REBUS).
          </p>
        </div>
      )}

      <PrototypeNav
        slugs={["1430-echo-void", "1418-beat-field", "1396-apophenia-field"]}
      />
    </main>
  );
}
