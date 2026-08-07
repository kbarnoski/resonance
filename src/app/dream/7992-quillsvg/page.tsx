"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7992-quillsvg — "Inscribe" · pole: dream · substrate: PURE SVG/DOM (no GPU)
//
// THE QUESTION: what if the whole instrument were a single sheet of paper and a
// quill — you write a living, variable-width ink line, the SHAPE of your
// handwriting IS the music, and the wet ink bleeds at its edges — all in
// inline SVG, no <canvas>, no WebGL, nothing on the GPU?
//
// The stroke's KINEMATICS (speed, curvature, pressure, acceleration) drive a
// real Web-Audio synth AND the ink geometry at once. Each completed stroke
// persists as its own SVG path and its recorded kinematic-EVENT stream loops
// through the synth while its bleed re-wets on each cycle — new strokes layer
// into a canon of your own handwriting (cap 6).
//
// Grounded in Calliphony (arXiv:2608.03040) — calligraphy as a real-time
// generative-music interface — and Gesture2Music (arXiv:2511.00793), whose key
// idea is to keep the kinematic-event stream separate from audio playback; here
// stroke.ts emits the events and audio.ts merely plays them.
//
// Determinism: the ghost quill that auto-writes on load is seeded with
// mulberry32(0x7992). No Math.random / Date.now / new Date(); timing uses
// performance.now(); AudioContext.currentTime is used only for envelope timing.
// ─────────────────────────────────────────────────────────────────────────────

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { startAudio, type QuillVoice } from "./audio";
import {
  bleedBlur,
  bleedScale,
  CORE_COLOR,
  inkFill,
  wetness,
} from "./ink";
import {
  centrePath,
  Eventizer,
  Kinematizer,
  makeGhost,
  ribbonPath,
  VIEW_H,
  VIEW_W,
  type RawSample,
  type SoundEvent,
  type StrokePoint,
} from "./stroke";

const MAX_LAYERS = 6;
const GHOST_SEED = 0x7992;

interface RenderLayer {
  id: number;
  ribbonD: string;
  centreD: string;
  avgP: number;
  ghost: boolean;
}

interface RuntimeLayer {
  id: number;
  events: SoundEvent[];
  durationMs: number;
  ghost: boolean;
  playheadMs: number;
  evPtr: number;
}

interface GhostState {
  active: boolean;
  u: number;
  fn: (u: number) => RawSample;
  kin: Kinematizer;
  evz: Eventizer;
  points: StrokePoint[];
  events: SoundEvent[];
  prev: StrokePoint | null;
  dur: number;
}

interface FilterHandles {
  disp?: SVGFEDisplacementMapElement;
  blur?: SVGFEGaussianBlurElement;
}

/** Map a client point into the SVG viewBox (preserveAspectRatio xMidYMid meet). */
function clientToView(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / VIEW_W, rect.height / VIEW_H);
  const ox = (rect.width - VIEW_W * scale) / 2;
  const oy = (rect.height - VIEW_H * scale) / 2;
  return {
    x: (clientX - rect.left - ox) / scale,
    y: (clientY - rect.top - oy) / scale,
  };
}

/** Quantize a loop length onto a ~0.5 s grid so the canon phases musically. */
function quantDur(ms: number): number {
  return Math.max(1400, Math.round(ms / 500) * 500);
}

/**
 * Real pointer pressure only when the device truly reports it (a pen, or a
 * touch value that isn't the mouse's default 0/0.5); otherwise 0 → the
 * Kinematizer synthesizes pressure from speed. Works for React and DOM events.
 */
function pressureOf(e: { pointerType: string; pressure: number }): number {
  if (e.pointerType === "pen" && e.pressure > 0) return e.pressure;
  if (e.pointerType === "touch" && e.pressure > 0 && e.pressure !== 0.5)
    return e.pressure;
  return 0;
}

function makeGhostState(reduced: boolean): GhostState {
  return {
    active: true,
    u: 0,
    fn: makeGhost(GHOST_SEED),
    kin: new Kinematizer(0),
    evz: new Eventizer(0),
    points: [],
    events: [],
    prev: null,
    dur: reduced ? 9000 : 6500,
  };
}

export default function QuillSvgPage() {
  // ── DOM / audio refs (never trigger re-render) ──────────────────────────────
  const svgRef = useRef<SVGSVGElement | null>(null);
  const activeRibbonRef = useRef<SVGPathElement | null>(null);
  const activeCentreRef = useRef<SVGPathElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const voiceRef = useRef<QuillVoice | null>(null);

  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const liveSpeedRef = useRef<number>(0);

  const ghostRef = useRef<GhostState>(makeGhostState(false));
  const layersRef = useRef<RuntimeLayer[]>([]);
  const filterRefs = useRef<Map<number, FilterHandles>>(new Map());
  const nextIdRef = useRef<number>(1);

  // ── Live user stroke state ──────────────────────────────────────────────────
  const drawingRef = useRef<boolean>(false);
  const uKinRef = useRef<Kinematizer | null>(null);
  const uEvzRef = useRef<Eventizer | null>(null);
  const uPointsRef = useRef<StrokePoint[]>([]);
  const uEventsRef = useRef<SoundEvent[]>([]);
  const uPrevRef = useRef<StrokePoint | null>(null);
  const uStartRef = useRef<number>(0);

  // ── React state (infrequent) ────────────────────────────────────────────────
  const [layers, setLayers] = useState<RenderLayer[]>([]);
  const [audioOn, setAudioOn] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── Commit a finished stroke into the canon (persist + loop) ────────────────
  const finalizeLayer = useCallback(
    (
      points: StrokePoint[],
      events: SoundEvent[],
      durationMs: number,
      ghost: boolean,
    ) => {
      if (points.length < 2) return;
      const avgP =
        points.reduce((s, p) => s + p.pressure, 0) / points.length;
      const id = nextIdRef.current++;
      const render: RenderLayer = {
        id,
        ribbonD: ribbonPath(points),
        centreD: centrePath(points),
        avgP,
        ghost,
      };
      layersRef.current.push({
        id,
        events,
        durationMs: quantDur(durationMs),
        ghost,
        playheadMs: 0,
        evPtr: 0,
      });
      // Cap the canon: drop the oldest, keeping refs in sync.
      while (layersRef.current.length > MAX_LAYERS) {
        const rm = layersRef.current.shift();
        if (rm) filterRefs.current.delete(rm.id);
      }
      setLayers((prev) =>
        [...prev, render].filter((l) =>
          layersRef.current.some((r) => r.id === l.id),
        ),
      );
    },
    [],
  );

  const clearActiveInk = useCallback(() => {
    activeRibbonRef.current?.setAttribute("d", "");
    activeCentreRef.current?.setAttribute("d", "");
  }, []);

  const startGhost = useCallback(() => {
    ghostRef.current = makeGhostState(reducedRef.current);
    clearActiveInk();
  }, [clearActiveInk]);

  // ── Audio unlock (first user gesture) ───────────────────────────────────────
  const enableSound = useCallback(async () => {
    if (ctxRef.current) return;
    try {
      const ac = new AudioContext();
      if (ac.state === "suspended") await ac.resume();
      ctxRef.current = ac;
      voiceRef.current = startAudio(ac);
      setAudioOn(true);
      setAudioBlocked(false);
    } catch {
      setAudioBlocked(true);
    }
  }, []);

  // ── The single animation loop: ghost writing + canon looping + bleed ────────
  const loop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(64, now - lastRef.current);
    lastRef.current = now;
    const reduced = reducedRef.current;
    const timeScale = reduced ? 0.7 : 1;

    // 1) Ghost quill writes itself across the sheet.
    const g = ghostRef.current;
    if (g.active) {
      const du = (dt * timeScale) / g.dur;
      const target = Math.min(1, g.u + du);
      const STEP = 0.006;
      while (g.u < target) {
        g.u = Math.min(target, g.u + STEP);
        const raw = g.fn(g.u);
        raw.t = g.u * g.dur;
        const pt = g.kin.push(raw);
        g.points.push(pt);
        const ev = g.evz.push(pt, g.prev);
        if (ev) {
          g.events.push(ev);
          voiceRef.current?.play(ev, 0.5);
        }
        g.prev = pt;
        if (pt.speed > liveSpeedRef.current) liveSpeedRef.current = pt.speed;
      }
      activeRibbonRef.current?.setAttribute("d", ribbonPath(g.points));
      activeCentreRef.current?.setAttribute("d", centrePath(g.points));
      if (g.u >= 1) {
        g.active = false;
        finalizeLayer(g.points, g.events, g.dur, true);
        clearActiveInk();
      }
    }

    // 2) Canon layers: advance playheads, fire events, re-wet the bleed.
    const voice = voiceRef.current;
    for (const L of layersRef.current) {
      L.playheadMs += dt * timeScale;
      if (L.playheadMs >= L.durationMs) {
        L.playheadMs -= L.durationMs;
        L.evPtr = 0;
      }
      while (
        L.evPtr < L.events.length &&
        L.events[L.evPtr].tMs <= L.playheadMs
      ) {
        const ev = L.events[L.evPtr];
        if (voice) voice.play(ev, L.ghost ? 0.42 : 0.6);
        if (ev.speed > liveSpeedRef.current) liveSpeedRef.current = ev.speed;
        L.evPtr++;
      }
      const phase = L.playheadMs / L.durationMs;
      const wet = wetness(phase, reduced);
      const fr = filterRefs.current.get(L.id);
      if (fr?.disp) fr.disp.setAttribute("scale", bleedScale(wet, reduced).toFixed(2));
      if (fr?.blur)
        fr.blur.setAttribute("stdDeviation", bleedBlur(wet, reduced).toFixed(2));
    }

    // 3) Master brightness follows recent hand speed, decaying when idle.
    liveSpeedRef.current *= 0.94;
    voice?.setBrightness(Math.min(1, liveSpeedRef.current * 2.4));

    rafRef.current = requestAnimationFrame(loop);
  }, [finalizeLayer, clearActiveInk]);

  // ── Mount: start the loop + the ghost immediately (visuals, no audio) ───────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    startGhost();
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      voiceRef.current?.stop();
      voiceRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => {
          ctx.close().catch(() => {
            /* already closed */
          });
        }, 500);
      }
    };
  }, [loop, startGhost]);

  // ── Pointer sampling → live ink + live sound ────────────────────────────────
  const sample = useCallback(
    (clientX: number, clientY: number, pressure: number, tiltX: number) => {
      const svg = svgRef.current;
      const kin = uKinRef.current;
      const evz = uEvzRef.current;
      if (!svg || !kin || !evz) return;
      const { x, y } = clientToView(svg, clientX, clientY);
      const raw: RawSample = { x, y, t: performance.now(), pressure, tiltX };
      const pt = kin.push(raw);
      uPointsRef.current.push(pt);
      const ev = evz.push(pt, uPrevRef.current);
      if (ev) {
        uEventsRef.current.push(ev);
        voiceRef.current?.play(ev, 0.75);
      }
      uPrevRef.current = pt;
      if (pt.speed > liveSpeedRef.current) liveSpeedRef.current = pt.speed;
      activeRibbonRef.current?.setAttribute("d", ribbonPath(uPointsRef.current));
      activeCentreRef.current?.setAttribute("d", centrePath(uPointsRef.current));
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      void enableSound();

      // If the ghost is still writing, commit what it has and free the pen.
      const g = ghostRef.current;
      if (g.active) {
        g.active = false;
        if (g.points.length > 2)
          finalizeLayer(g.points, g.events, g.dur, true);
        clearActiveInk();
      }

      const t0 = performance.now();
      uKinRef.current = new Kinematizer(t0);
      uEvzRef.current = new Eventizer(t0);
      uPointsRef.current = [];
      uEventsRef.current = [];
      uPrevRef.current = null;
      uStartRef.current = t0;
      drawingRef.current = true;
      setHasDrawn(true);
      try {
        svgRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
      sample(e.clientX, e.clientY, pressureOf(e), e.tiltX);
    },
    [enableSound, finalizeLayer, clearActiveInk, sample],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const coalesced =
        typeof e.nativeEvent.getCoalescedEvents === "function"
          ? e.nativeEvent.getCoalescedEvents()
          : null;
      if (coalesced && coalesced.length > 0) {
        for (const c of coalesced) {
          sample(c.clientX, c.clientY, pressureOf(c), c.tiltX);
        }
      } else {
        sample(e.clientX, e.clientY, pressureOf(e), e.tiltX);
      }
    },
    [sample],
  );

  const endStroke = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const pts = uPointsRef.current;
      if (pts.length > 2) {
        const dur = pts[pts.length - 1].t - uStartRef.current;
        finalizeLayer(pts, uEventsRef.current, dur, false);
      }
      clearActiveInk();
    },
    [finalizeLayer, clearActiveInk],
  );

  const clearAll = useCallback(() => {
    layersRef.current = [];
    filterRefs.current.clear();
    setLayers([]);
    liveSpeedRef.current = 0;
    startGhost();
  }, [startGhost]);

  // ── Ref-callback factory for a layer's live filter handles ──────────────────
  const setFilterRef = (
    id: number,
    key: "disp" | "blur",
  ): ((el: SVGElement | null) => void) => {
    return (el) => {
      const m = filterRefs.current.get(id) ?? {};
      if (key === "disp") m.disp = (el as SVGFEDisplacementMapElement) ?? undefined;
      else m.blur = (el as SVGFEGaussianBlurElement) ?? undefined;
      filterRefs.current.set(id, m);
    };
  };

  const activeBleed = reducedRef.current ? 4 : 8;
  const activeBlur = reducedRef.current ? 0.6 : 1.1;

  return (
    <main
      className="relative min-h-screen w-full touch-none overflow-hidden bg-[#07040e] text-foreground"
      style={{ touchAction: "none" }}
    >
      {/* ── The whole instrument: one inline-SVG sheet of paper ─────────────── */}
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full cursor-crosshair"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
      >
        <defs>
          <radialGradient id="q-paper" cx="50%" cy="42%" r="78%">
            <stop offset="0%" stopColor="#160c2b" />
            <stop offset="60%" stopColor="#0c0720" />
            <stop offset="100%" stopColor="#060411" />
          </radialGradient>

          {/* Paper grain — pure SVG turbulence, faint violet-tinted alpha. */}
          <filter id="q-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves={2}
              seed={GHOST_SEED}
              stitchTiles="stitch"
              result="n"
            />
            <feColorMatrix
              in="n"
              type="matrix"
              values="0 0 0 0 0.06
                      0 0 0 0 0.04
                      0 0 0 0 0.11
                      0 0 0 0.6 0"
            />
          </filter>

          {/* The wet-bleed filter for the CURRENTLY-drawing stroke (static). */}
          <filter
            id="q-bleed-active"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.02"
              numOctaves={2}
              seed={17}
              result="bn"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="bn"
              scale={activeBleed}
              xChannelSelector="R"
              yChannelSelector="G"
              result="bd"
            />
            <feGaussianBlur in="bd" stdDeviation={activeBlur} />
          </filter>

          {/* One wet-bleed filter per canon layer — scale/blur ride its cycle. */}
          {layers.map((l) => (
            <filter
              key={`f-${l.id}`}
              id={`q-bleed-${l.id}`}
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.02"
                numOctaves={2}
                seed={(l.id * 733) % 900}
                result="n"
              />
              <feDisplacementMap
                ref={setFilterRef(l.id, "disp")}
                in="SourceGraphic"
                in2="n"
                scale={5}
                xChannelSelector="R"
                yChannelSelector="G"
                result="d"
              />
              <feGaussianBlur
                ref={setFilterRef(l.id, "blur")}
                in="d"
                stdDeviation={1}
              />
            </filter>
          ))}
        </defs>

        {/* Paper base + grain + faint ruled baselines. */}
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#q-paper)" />
        <rect
          x={0}
          y={0}
          width={VIEW_W}
          height={VIEW_H}
          filter="url(#q-grain)"
          opacity={0.5}
        />
        <g stroke="#2a1d55" strokeWidth={1} opacity={0.35}>
          {[0.28, 0.44, 0.6, 0.76].map((fy) => (
            <line
              key={`rule-${fy}`}
              x1={VIEW_W * 0.06}
              y1={VIEW_H * fy}
              x2={VIEW_W * 0.94}
              y2={VIEW_H * fy}
            />
          ))}
        </g>

        {/* Persisted canon layers (older underneath, newer on top). */}
        {layers.map((l) => (
          <g key={`layer-${l.id}`} opacity={l.ghost ? 0.9 : 1}>
            <path d={l.ribbonD} fill={inkFill(l.avgP)} filter={`url(#q-bleed-${l.id})`} />
            <path
              d={l.centreD}
              fill="none"
              stroke={CORE_COLOR}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45}
            />
          </g>
        ))}

        {/* The currently-drawing (or ghost-writing) stroke, on top. */}
        <g filter="url(#q-bleed-active)">
          <path ref={activeRibbonRef} d="" fill={inkFill(0.55)} />
        </g>
        <path
          ref={activeCentreRef}
          d=""
          fill="none"
          stroke={CORE_COLOR}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
      </svg>

      {/* subtle vignette so chrome stays legible over the ink */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/55" />

      {/* ── Title + one-line description ────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-0 top-0 max-w-xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Inscribe
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          The whole instrument is a sheet of paper and a quill. Write, and the
          shape of your handwriting is the music &mdash; the ink swells where you
          press, bleeds while it&rsquo;s wet, then loops back as a canon of your
          own hand.
        </p>
      </div>

      {/* ── Bottom controls ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
        {!hasDrawn && (
          <p className="pointer-events-none text-base text-muted-foreground">
            {audioOn
              ? "Draw on the paper to write your own line."
              : "A ghost hand is writing. Draw, or enable sound, to join in."}
          </p>
        )}
        {audioBlocked && (
          <p className="text-base text-muted-foreground">
            Audio is blocked on this device &mdash; the ink still writes.
          </p>
        )}
        <div className="pointer-events-auto flex items-center gap-3">
          {!audioOn && (
            <button
              type="button"
              onClick={() => void enableSound()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enable sound
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Design-notes affordance ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-16 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is the deliberately GPU-free member of the &ldquo;Inscribe&rdquo;
                family: no <span className="font-mono">&lt;canvas&gt;</span>, no
                WebGL. The ink is a real inline-SVG <span className="font-mono">
                  &lt;path&gt;</span>{" "}
                whose width varies point-to-point, and the wet-bleed is an SVG
                filter graph (<span className="font-mono">feTurbulence</span> →{" "}
                <span className="font-mono">feDisplacementMap</span> →{" "}
                <span className="font-mono">feGaussianBlur</span>) whose
                displacement re-wets on each canon cycle.
              </p>
              <p>
                Your stroke&rsquo;s kinematics are the instrument. Speed sets note
                density and brightness; curvature picks pitch (a straight run
                holds a tone, a sharp turn leaps); pressure sets loudness{" "}
                <em>and</em> ink width &mdash; press harder for a fatter, louder,
                wetter line; acceleration sharpens the attack. Pitch is quantized
                to a warm just-intonation pentatonic.
              </p>
              <p>
                Following Gesture2Music (arXiv:2511.00793), the kinematic-event
                stream is kept separate from playback: each completed stroke
                stores its events and loops them through the same synth, layering
                into a canon (capped at six) of your own handwriting. The concept
                is grounded in Calliphony (arXiv:2608.03040), calligraphy as a
                real-time generative-music interface. On load a seeded ghost quill
                auto-writes so the idea reads on a muted screen with zero input.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7992-quillsvg"]} />
    </main>
  );
}
