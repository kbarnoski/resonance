"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createAudio, type AudioEngine } from "./audio";
import { buildGhost, type Ghost } from "./ghost";
import { BAND_H, marksInRange, type Mark } from "./score";
import { README } from "./readme-text";

// ---- warm paper-and-ink palette (SVG ART LAYER ONLY) ----------------------
const PAPER = "#e8ddc5"; // warm page
const PAPER_EDGE = "#d6c8a6"; // page shadow / rule
const INK = "#2a251d"; // graphite ink
const ACCENT = "#b23b1e"; // cinnabar — the playhead & sounding marks
const GLOW = "drop-shadow(0 0 6px rgba(178,59,30,0.55))";

// ---- performance constants ------------------------------------------------
const SEED = 196367; // Treatise, 1963–67 — the fixed page
const WHEEL_SENS = 0.6;
const TOUCH_SENS = 1.5;
const IDLE_MS = 1500;
const PAD_PX = 130; // render a little beyond the viewport
const PLAYHEAD_FRAC = 0.4; // playhead sits 40% down the page

interface Dims {
  W: number;
  H: number;
}

export default function TreatiseScrollPage() {
  // ---- refs (per-frame state, no re-render) ----
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const markRefs = useRef<Map<number, SVGGElement>>(new Map());
  const engineRef = useRef<AudioEngine | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const rafRef = useRef<number | null>(null);

  const readYRef = useRef(0);
  const prevReadYRef = useRef(0);
  const velRef = useRef(0);
  const lastInputRef = useRef(-Infinity);
  const lastTsRef = useRef(0);
  const ghostClockRef = useRef(0);
  const lastTouchYRef = useRef(0);
  const reducedRef = useRef(false);
  const dimsRef = useRef<Dims>({ W: 0, H: 0 });
  const visibleRangeRef = useRef<{ first: number; last: number }>({
    first: NaN,
    last: NaN,
  });
  const renderMarksRef = useRef<Mark[]>([]);
  const prevActiveRef = useRef<Set<number>>(new Set());
  const startedRef = useRef(false);
  const forceGhostRef = useRef(false);
  const mutedRef = useRef(false);

  // ---- readout DOM refs ----
  const tempoFillRef = useRef<HTMLDivElement | null>(null);
  const modeTextRef = useRef<HTMLSpanElement | null>(null);
  const voiceTextRef = useRef<HTMLSpanElement | null>(null);

  // ---- reactive UI state ----
  const [dims, setDims] = useState<Dims>({ W: 0, H: 0 });
  const [marks, setMarks] = useState<Mark[]>([]);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [heroOpen, setHeroOpen] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState<string | null>(null);

  const ensureStarted = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    void eng.resume().then(() => {
      if (eng.ctx.state === "running") setAudioBlocked(null);
      else setAudioBlocked("Tap “Begin reading” to enable sound.");
    });
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
    }
  }, []);

  // ---- mount: audio engine, ghost, dimensions, animation loop ----
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    ghostRef.current = buildGhost(SEED);

    const measure = () => {
      const W = window.innerWidth;
      const H = window.innerHeight - 48; // below the fixed global header
      dimsRef.current = { W, H };
      setDims({ W, H });
    };
    measure();
    window.addEventListener("resize", measure);

    // create the context up-front so the ghost can self-demo with sound where
    // the browser allows it; a user gesture will resume it otherwise.
    try {
      const eng = createAudio();
      engineRef.current = eng;
      void eng.resume().then(() => {
        if (eng.ctx.state === "running") {
          startedRef.current = true;
          setStarted(true);
        } else {
          setAudioBlocked("Tap “Begin reading” to enable sound.");
        }
      });
    } catch {
      setAudioBlocked("Audio is unavailable in this browser.");
    }

    const applyActive = (activeIds: Set<number>) => {
      const prev = prevActiveRef.current;
      for (const id of prev) {
        if (!activeIds.has(id)) {
          const el = markRefs.current.get(id);
          if (el) {
            el.style.color = INK;
            el.style.filter = "";
          }
        }
      }
      for (const id of activeIds) {
        const el = markRefs.current.get(id);
        if (el) {
          el.style.color = ACCENT;
          el.style.filter = GLOW;
        }
      }
      prevActiveRef.current = activeIds;
    };

    const frame = (ts: number) => {
      const { H } = dimsRef.current;
      if (!lastTsRef.current) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.05) dt = 0.05;

      const ghostDriving =
        forceGhostRef.current || ts - lastInputRef.current > IDLE_MS;
      if (ghostDriving && ghostRef.current) {
        const slow = reducedRef.current ? 0.45 : 1;
        ghostClockRef.current += dt * slow;
        readYRef.current +=
          ghostRef.current.velocity(ghostClockRef.current) * slow * dt;
      }

      const readY = readYRef.current;
      const rawVel = (readY - prevReadYRef.current) / Math.max(dt, 1e-4);
      prevReadYRef.current = readY;
      velRef.current = velRef.current * 0.85 + rawVel * 0.15;
      const energy = Math.min(1, Math.abs(velRef.current) / 220);

      const playheadY = H * PLAYHEAD_FRAC;
      if (groupRef.current) {
        groupRef.current.setAttribute(
          "transform",
          `translate(0 ${(playheadY - readY).toFixed(2)})`,
        );
      }

      // recompute the rendered mark set only when the visible bands shift
      const fromY = readY - playheadY - PAD_PX;
      const toY = readY + (H - playheadY) + PAD_PX;
      const firstBand = Math.floor(fromY / BAND_H);
      const lastBand = Math.floor(toY / BAND_H);
      const vr = visibleRangeRef.current;
      if (firstBand !== vr.first || lastBand !== vr.last) {
        visibleRangeRef.current = { first: firstBand, last: lastBand };
        const next = marksInRange(SEED, fromY, toY);
        renderMarksRef.current = next;
        setMarks(next);
      }

      // audio
      let activeIds = new Set<number>();
      const eng = engineRef.current;
      if (eng && startedRef.current) {
        activeIds = eng.update(readY, energy, renderMarksRef.current);
      }
      applyActive(activeIds);

      // readouts
      if (tempoFillRef.current)
        tempoFillRef.current.style.width = `${Math.round(energy * 100)}%`;
      if (voiceTextRef.current)
        voiceTextRef.current.textContent = String(activeIds.size);
      if (modeTextRef.current) {
        let mode: string;
        if (ghostDriving) mode = "ghost reading";
        else if (energy < 0.04)
          mode = activeIds.size > 0 ? "sustaining" : "still";
        else mode = "reading";
        modeTextRef.current.textContent = mode;
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", measure);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ---- scroll capture: wheel + touch on the score surface ----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      readYRef.current += e.deltaY * WHEEL_SENS;
      lastInputRef.current = performance.now();
      forceGhostRef.current = false;
      if (autoRead) setAutoRead(false);
      if (heroOpen) setHeroOpen(false);
      ensureStarted();
    };
    const onTouchStart = (e: TouchEvent) => {
      lastTouchYRef.current = e.touches[0].clientY;
      lastInputRef.current = performance.now();
      ensureStarted();
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const y = e.touches[0].clientY;
      readYRef.current += (lastTouchYRef.current - y) * TOUCH_SENS;
      lastTouchYRef.current = y;
      lastInputRef.current = performance.now();
      forceGhostRef.current = false;
      if (autoRead) setAutoRead(false);
      if (heroOpen) setHeroOpen(false);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [autoRead, heroOpen, ensureStarted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toggleAutoRead = useCallback(() => {
    setAutoRead((a) => {
      const next = !a;
      forceGhostRef.current = next;
      if (next) ensureStarted();
      return next;
    });
  }, [ensureStarted]);

  const beginReading = useCallback(() => {
    setHeroOpen(false);
    ensureStarted();
    lastInputRef.current = performance.now();
    readYRef.current += 24; // a gentle first step into the score
  }, [ensureStarted]);

  const { W, H } = dims;
  const playheadY = H * PLAYHEAD_FRAC;
  const MX = W * 0.06;
  const innerW = W - 2 * MX;
  const px = (x: number) => MX + x * innerW;

  const ghostBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <section className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* score surface (captures scroll) */}
      <div ref={wrapRef} className="absolute inset-0 touch-none">
        {W > 0 && (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            aria-label="A scrolling graphic score you perform by reading"
          >
            {/* floating warm page */}
            <rect
              x={MX * 0.5}
              y={0}
              width={W - MX}
              height={H}
              rx={6}
              fill={PAPER}
            />
            <rect
              x={MX * 0.5}
              y={0}
              width={W - MX}
              height={H}
              rx={6}
              fill="none"
              stroke={PAPER_EDGE}
              strokeWidth={1}
            />

            {/* central vertical spine — the continuous reading thread (fixed) */}
            <line
              x1={px(0.5)}
              y1={0}
              x2={px(0.5)}
              y2={H}
              stroke={INK}
              strokeOpacity={0.18}
              strokeWidth={1}
            />

            {/* the marks, translated as one group while reading */}
            <g ref={groupRef}>
              {marks.map((m) => (
                <g
                  key={m.id}
                  ref={(el) => {
                    const map = markRefs.current;
                    if (el) map.set(m.id, el);
                    else map.delete(m.id);
                  }}
                  style={{ color: INK }}
                >
                  {renderMark(m, px, innerW)}
                </g>
              ))}
            </g>

            {/* fixed playhead line — "the now" */}
            <line
              x1={0}
              y1={playheadY}
              x2={W}
              y2={playheadY}
              stroke={ACCENT}
              strokeWidth={1.5}
              strokeOpacity={0.85}
            />
            <circle cx={MX * 0.9} cy={playheadY} r={4} fill={ACCENT} />
            <circle cx={W - MX * 0.9} cy={playheadY} r={4} fill={ACCENT} />
          </svg>
        )}
      </div>

      {/* top-left HUD */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-xs">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          graphic score · reading = performing
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            tempo
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              ref={tempoFillRef}
              className="h-full w-0 bg-primary transition-[width] duration-100"
            />
          </div>
        </div>
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">
          <span ref={modeTextRef} className="text-foreground">
            still
          </span>
          {" · voices "}
          <span ref={voiceTextRef}>0</span>
        </p>
        {audioBlocked && (
          <p className="mt-2 text-sm text-destructive">{audioBlocked}</p>
        )}
      </div>

      {/* top-right controls */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleAutoRead}
          className={
            autoRead
              ? "min-h-[44px] rounded-md border border-border bg-accent px-4 text-sm text-foreground transition-colors"
              : ghostBtn
          }
          aria-pressed={autoRead}
        >
          ▷ Auto-read
        </button>
        <button
          type="button"
          onClick={toggleMute}
          className={ghostBtn}
          disabled={!started}
          aria-pressed={muted}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className={ghostBtn}
        >
          Read the design notes
        </button>
      </div>

      {/* hero overlay */}
      {heroOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/60 px-6 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background/90 p-8 text-center shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              1958 · treatise scroll
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Reading is performing
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Scroll to read this graphic score — your speed is the tempo,
              stopping sustains the marks under the line as a held drone. The
              music exists only while you read.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={beginReading}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin reading ▷
              </button>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className={ghostBtn}
              >
                Design notes
              </button>
            </div>
            <p className="mt-4 font-mono text-xs text-muted-foreground/70">
              or just start scrolling
            </p>
          </div>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1958-treatise-scroll"]} />
    </section>
  );
}

// ---- SVG rendering per mark type (art layer; raw ink colours allowed) ------
function renderMark(
  m: Mark,
  px: (x: number) => number,
  innerW: number,
): ReactNode {
  const cx = px(m.x);
  switch (m.type) {
    case "line": {
      const w = m.w * innerW;
      const faint = m.thickness < 3;
      return (
        <rect
          x={cx - w / 2}
          y={m.y - m.thickness / 2}
          width={w}
          height={m.thickness}
          fill="currentColor"
          fillOpacity={faint ? 0.3 : 0.92}
          rx={m.thickness / 2}
        />
      );
    }
    case "circle":
      return (
        <circle
          cx={cx}
          cy={m.y}
          r={m.r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.9}
          strokeWidth={m.thickness}
        />
      );
    case "dot":
      return <circle cx={cx} cy={m.y} r={m.r} fill="currentColor" />;
    case "cluster":
      return (
        <>
          {(m.dots ?? []).map((d, i) => (
            <circle
              key={i}
              cx={cx + d.dx}
              cy={m.y + d.dy}
              r={3}
              fill="currentColor"
            />
          ))}
        </>
      );
    case "arc": {
      const span = m.span ?? 40;
      const bend = m.bend ?? 30;
      const d = `M ${cx} ${m.y - span / 2} Q ${cx + bend} ${m.y} ${cx} ${
        m.y + span / 2
      }`;
      return (
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.9}
          strokeWidth={m.thickness}
          strokeLinecap="round"
        />
      );
    }
    case "box": {
      const w = m.w * innerW;
      const h = m.boxH ?? 60;
      return (
        <rect
          x={cx - w / 2}
          y={m.y - h / 2}
          width={w}
          height={h}
          fill="currentColor"
          fillOpacity={0.12}
          stroke="currentColor"
          strokeOpacity={0.8}
          strokeWidth={m.thickness}
        />
      );
    }
    case "numbers":
      return (
        <text
          x={cx}
          y={m.y}
          fill="currentColor"
          fontFamily="var(--font-mono, monospace)"
          fontSize={17}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {m.glyphs}
        </text>
      );
    default:
      return null;
  }
}
