"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { computeAcoustics, type Vec, type AcousticsResult } from "./acoustics";
import { renderImpulseResponse, renderPhrase, type Phrase } from "./synth";
import {
  drawScene,
  screenToWorld,
  worldToScreen,
  type Pip,
  type Transform,
} from "./viz";

// Canvas logical size (world is drawn in these coordinates, then CSS-scaled).
const LW = 680;
const LH = 520;
const TF: Transform = { scale: 34, cx: LW / 2, cy: LH / 2 };
const WORLD_BOUND = 9;
const VISUAL_SCALE = 7; // slows tiny (ms) reflection delays into watchable pips
const MIN_PIP_MS = 220;

type HandleId = "source" | "listener" | `corner-${number}` | null;

function clampWorld(p: Vec): Vec {
  return {
    x: Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.x)),
    y: Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.y)),
  };
}

export default function MirrorHallPage() {
  // ── Geometry (world metres) ────────────────────────────────────────────────
  const [poly, setPoly] = useState<Vec[]>([
    { x: -4, y: 3 },
    { x: 4, y: 3 },
    { x: 4, y: -3 },
    { x: -4, y: -3 },
  ]);
  const [source, setSource] = useState<Vec>({ x: -2.4, y: -1.4 });
  const [listener, setListener] = useState<Vec>({ x: 2.2, y: 1.4 });
  const [absorption, setAbsorption] = useState(0.18);

  // ── Audio state ────────────────────────────────────────────────────────────
  const [audioReady, setAudioReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const phraseRef = useRef<Phrase | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);

  // ── The acoustic solve — real image-source method, memoised on geometry ─────
  const acoustics: AcousticsResult = useMemo(
    () => computeAcoustics(poly, source, listener, absorption, 3),
    [poly, source, listener, absorption],
  );

  // Refs the animation loop reads without re-subscribing.
  const sceneRef = useRef({ poly, source, listener, taps: acoustics.taps, hover: null as HandleId });
  sceneRef.current.poly = poly;
  sceneRef.current.source = source;
  sceneRef.current.listener = listener;
  sceneRef.current.taps = acoustics.taps;
  const acousticsRef = useRef(acoustics);
  acousticsRef.current = acoustics;
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipsRef = useRef<Pip[]>([]);
  const [hover, setHover] = useState<HandleId>(null);
  sceneRef.current.hover = hover;

  // Playback bookkeeping for pip scheduling.
  const playStartRef = useRef(0);
  const lastPosRef = useRef(0);
  const playingRef = useRef(false);

  // ── Rebuild the convolver's impulse response when geometry changes ──────────
  useEffect(() => {
    const ctx = ctxRef.current;
    const conv = convolverRef.current;
    if (!ctx || !conv) return;
    const id = window.setTimeout(() => {
      conv.buffer = renderImpulseResponse(ctx, acoustics.taps, 0.6);
    }, 60);
    return () => window.clearTimeout(id);
  }, [acoustics]);

  const spawnPips = useCallback((now: number) => {
    const taps = acousticsRef.current.taps;
    taps.forEach((tap, idx) => {
      if (tap.order < 1 || tap.order > 2) return;
      pipsRef.current.push({
        tapIndex: idx,
        start: now,
        durationMs: Math.max(MIN_PIP_MS, tap.delay * 1000 * VISUAL_SCALE),
        order: tap.order,
      });
    });
  }, []);

  // ── Animation loop: draw the radar + advance energy pips ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = LW * dpr;
    canvas.height = LH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const frame = () => {
      const now = performance.now();
      // Spawn pips as note onsets pass, following the (possibly looping) phrase.
      const ph = phraseRef.current;
      if (playingRef.current && ph) {
        const dur = ph.buffer.duration;
        const elapsed = (now - playStartRef.current) / 1000;
        if (!loopRef.current && elapsed > dur + 3.5) {
          playingRef.current = false;
        }
        const curPos = loopRef.current ? elapsed % dur : Math.min(elapsed, dur + 0.01);
        const prev = lastPosRef.current;
        const wrapped = loopRef.current && curPos < prev;
        for (const on of ph.onsets) {
          const fired = wrapped ? on > prev || on <= curPos : on > prev && on <= curPos;
          if (fired) spawnPips(now);
        }
        lastPosRef.current = curPos;
      }
      // Prune finished pips.
      pipsRef.current = pipsRef.current.filter(
        (p) => (now - p.start) / p.durationMs <= 1,
      );
      drawScene(ctx, LW, LH, TF, {
        poly: sceneRef.current.poly,
        source: sceneRef.current.source,
        listener: sceneRef.current.listener,
        taps: sceneRef.current.taps,
        pips: pipsRef.current,
        now,
        hover: sceneRef.current.hover,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spawnPips]);

  // ── Audio wiring ────────────────────────────────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    convolver.connect(master);
    master.connect(ctx.destination);
    convolver.buffer = renderImpulseResponse(ctx, acousticsRef.current.taps, 0.6);
    ctxRef.current = ctx;
    convolverRef.current = convolver;
    phraseRef.current = renderPhrase(ctx);
    setAudioReady(true);
  }, []);

  const stopPhrase = useCallback(() => {
    if (srcRef.current) {
      try {
        srcRef.current.stop();
      } catch {
        // already stopped
      }
      srcRef.current.disconnect();
      srcRef.current = null;
    }
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const playPhrase = useCallback(async () => {
    await ensureAudio();
    const ctx = ctxRef.current;
    const conv = convolverRef.current;
    const ph = phraseRef.current;
    if (!ctx || !conv || !ph) return;
    stopPhrase();
    const src = ctx.createBufferSource();
    src.buffer = ph.buffer;
    src.loop = loopRef.current;
    src.connect(conv);
    src.onended = () => {
      if (!loopRef.current) stopPhrase();
    };
    src.start();
    srcRef.current = src;
    playStartRef.current = performance.now();
    lastPosRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
    spawnPips(performance.now());
  }, [ensureAudio, stopPhrase, spawnPips]);

  // Keep a live source's loop flag in sync with the toggle.
  useEffect(() => {
    if (srcRef.current) srcRef.current.loop = loop;
  }, [loop]);

  useEffect(() => {
    return () => {
      if (ctxRef.current) void ctxRef.current.close();
    };
  }, []);

  // ── Pointer dragging ────────────────────────────────────────────────────────
  const pointerToScreen = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * LW) / rect.width,
      y: ((e.clientY - rect.top) * LH) / rect.height,
    };
  }, []);

  const handleAt = useCallback(
    (sx: number, sy: number): HandleId => {
      const near = (p: Vec, r = 14) => {
        const s = worldToScreen(p, TF);
        return Math.hypot(s.x - sx, s.y - sy) <= r;
      };
      if (near(source, 12)) return "source";
      if (near(listener, 12)) return "listener";
      for (let i = 0; i < poly.length; i++) {
        if (near(poly[i])) return `corner-${i}` as HandleId;
      }
      return null;
    },
    [source, listener, poly],
  );

  const dragRef = useRef<HandleId>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointerToScreen(e);
      const id = handleAt(x, y);
      if (!id) return;
      dragRef.current = id;
      setHover(id);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [handleAt, pointerToScreen],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const { x, y } = pointerToScreen(e);
      const id = dragRef.current;
      if (!id) {
        const h = handleAt(x, y);
        if (h !== hover) setHover(h);
        return;
      }
      const world = clampWorld(screenToWorld(x, y, TF));
      if (id === "source") setSource(world);
      else if (id === "listener") setListener(world);
      else {
        const idx = Number(id.split("-")[1]);
        setPoly((prev) => prev.map((p, i) => (i === idx ? world : p)));
      }
    },
    [handleAt, hover, pointerToScreen],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no capture
      }
    }
    dragRef.current = null;
  }, []);

  // ── Readouts ────────────────────────────────────────────────────────────────
  const validTaps = acoustics.taps.length;
  const risk = acoustics.flutterRisk;
  const flutterHz = acoustics.flutterPeriodMs > 0 ? 1000 / acoustics.flutterPeriodMs : 0;
  const riskLabel = risk > 0.55 ? "flutter echo" : risk > 0.32 ? "coloration" : "clean bloom";
  const riskDestructive = risk > 0.55;

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          3328 · mirror hall
        </p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Sculpt a room, hear its reflections
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">
              A physically-grounded acoustic sandbox. The image-source method
              renders your piano through the exact early reflections this
              geometry produces. A plain rectangle rings with a flutter echo —
              splay its parallel walls or soften them to make the phrase bloom.
            </p>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            design notes
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* Radar */}
          <div className="overflow-hidden rounded-lg border border-border bg-[#0a0a0f]">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={(e) => {
                endDrag(e);
                if (!dragRef.current) setHover(null);
              }}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                touchAction: "none",
                cursor: hover ? "grab" : "default",
              }}
            />
          </div>

          {/* Controls + readouts */}
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <button
                onClick={playing && loop ? stopPhrase : playPhrase}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {playing && loop ? "Stop" : "Play phrase"}
              </button>
              <button
                onClick={() => setLoop((v) => !v)}
                className={`min-h-[44px] rounded-md border border-border px-4 text-sm transition-colors hover:bg-accent hover:text-foreground ${
                  loop ? "bg-accent text-foreground" : "bg-background/60 text-muted-foreground"
                }`}
              >
                Loop {loop ? "on" : "off"}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  wall absorption
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {Math.round(absorption * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.01}
                value={absorption}
                onChange={(e) => setAbsorption(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Hard walls (low %) give long, bright reflections; soft walls damp
                the tail quickly.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  flutter risk
                </span>
                <span
                  className={`font-mono text-xs uppercase tracking-[0.14em] ${
                    riskDestructive ? "text-destructive" : "text-primary"
                  }`}
                >
                  {riskLabel}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    riskDestructive ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${Math.round(risk * 100)}%` }}
                />
              </div>
              {flutterHz > 0 && risk > 0.32 && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Periodic reflections near{" "}
                  <span className="text-foreground">{Math.round(flutterHz)} Hz</span> — the
                  metallic ring of parallel walls.
                </p>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
              <dt>reflections</dt>
              <dd className="text-right text-foreground">{validTaps - 1}</dd>
              <dt>early spread</dt>
              <dd className="text-right text-foreground">
                {Math.round(acoustics.spreadMs)} ms
              </dd>
              <dt>audio</dt>
              <dd className="text-right text-foreground">
                {audioReady ? "ready" : "idle"}
              </dd>
            </dl>

            <p className="text-sm leading-relaxed text-muted-foreground">
              Drag the corner squares to reshape the room, and the{" "}
              <span className="text-primary">S</span> /{" "}
              <span className="text-foreground">L</span> dots to move source and
              listener. Turn Loop on to reshape while it plays.
            </p>
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what if
                you could sculpt a room&apos;s shape with your hands and hear your
                piano rendered through the exact early reflections that geometry
                produces?
              </p>
              <p>
                The acoustics are a real 2D <span className="text-foreground">image-source method</span>{" "}
                (Allen &amp; Berkley 1979). The source is mirrored across each wall
                to build 1st-, 2nd- and 3rd-order image sources; every candidate is
                validated by reconstructing its specular ray path back through the
                reflecting walls, and kept only if each bounce truly lands on its
                wall segment.
              </p>
              <p>
                Each valid image contributes one tap — delay = path length ÷ 343
                m/s, gain = reflection coefficients ÷ distance — assembled into a
                short impulse response driving a Web Audio ConvolverNode. The dry
                phrase is a Karplus-Strong plucked string, routed through the room.
              </p>
              <p>
                <span className="text-foreground">Flutter echo</span> emerges on its
                own: when two walls go parallel and far apart, the image sources
                line up into equally-spaced taps. We detect it as an
                autocorrelation peak in the tap train — the periodicity that is
                literally the buzzy metallic ring you hear.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["3328-mirrorhall"]} />
    </main>
  );
}
