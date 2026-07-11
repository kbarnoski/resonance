"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  RING,
  RING_SIZE,
  TEMPERAMENTS,
  WOLF_HI,
  WOLF_LO,
  edgeForStep,
  readEdge,
  type EdgeReading,
} from "./temperament";
import { createWolfAudio, type WolfAudio } from "./audio";

// ─── Ring geometry ───────────────────────────────────────────────────────────
const RADIUS = 188; // px — distance of each tile from the ring centre
const TILT = -15; // deg — perspective tilt of the whole ring
const STEP_DEG = 360 / RING_SIZE; // 30°

const IDLE_MS = 5000; // auto-demo kicks in after this much stillness
const STEP_MS = 1350; // demo dwell on an ordinary fifth
const WOLF_MS = 2300; // longer dwell so the wolf gets to howl

function fmtCents(c: number): string {
  const r = Math.round(c * 10) / 10;
  return `${r > 0 ? "+" : ""}${r.toFixed(1)}`;
}

export default function WolfRingPage() {
  const [started, setStarted] = useState(false);
  const [tempIdx, setTempIdx] = useState(1); // start in meantone — the sweet one
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reading, setReading] = useState<EdgeReading | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDemo, setIsDemo] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [scale, setScale] = useState(1);

  const reduced = useMemo(() => prefersReducedMotion(), []);

  const audioRef = useRef<WolfAudio | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startOff: number }>({
    active: false,
    startX: 0,
    startOff: 0,
  });
  const draggingRef = useRef(false);

  // Refs so demo/idle closures always see fresh values.
  const tempIdxRef = useRef(tempIdx);
  const currentRef = useRef(currentIndex);
  useEffect(() => {
    tempIdxRef.current = tempIdx;
  }, [tempIdx]);
  useEffect(() => {
    currentRef.current = currentIndex;
  }, [currentIndex]);

  const demoActiveRef = useRef(false);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runDemoRef = useRef<() => void>(() => undefined);

  // ── Responsive scale ───────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 560;
      setScale(Math.max(0.58, Math.min(1, w / 560)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [started]);

  // ── Core: take one step around the ring and sound the fifth crossed ─────
  const stepTo = useCallback((target: number) => {
    const temp = TEMPERAMENTS[tempIdxRef.current];
    const loIdx = edgeForStep(currentRef.current, target);
    const r = readEdge(temp, loIdx);
    const thirdRatio = Math.pow(2, temp.majorThirdCents / 1200);
    const fifthRatio = Math.pow(2, r.fifthCents / 1200);
    audioRef.current?.playEdge(r.rootHz, thirdRatio, fifthRatio);
    currentRef.current = target;
    setCurrentIndex(target);
    setReading(r);
  }, []);

  // ── Demo control ───────────────────────────────────────────────────────
  const stopDemo = useCallback(() => {
    demoActiveRef.current = false;
    setIsDemo(false);
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    runDemoRef.current = () => {
      if (!demoActiveRef.current) return;
      const next = (currentRef.current + 1) % RING_SIZE;
      stepTo(next);
      // Landing on E♭ from G♯ means we just crossed the wolf — dwell on it.
      const crossedWolf = next === WOLF_HI;
      demoTimerRef.current = setTimeout(
        runDemoRef.current,
        crossedWolf ? WOLF_MS : STEP_MS,
      );
    };
  }, [stepTo]);

  const startDemo = useCallback(() => {
    if (demoActiveRef.current) return;
    demoActiveRef.current = true;
    setIsDemo(true);
    demoTimerRef.current = setTimeout(() => runDemoRef.current(), 300);
  }, []);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!demoActiveRef.current) startDemo();
    }, IDLE_MS);
  }, [startDemo]);

  const onUserAction = useCallback(() => {
    stopDemo();
    scheduleIdle();
  }, [stopDemo, scheduleIdle]);

  // ── Begin ──────────────────────────────────────────────────────────────
  const handleBegin = useCallback(() => {
    const audio = createWolfAudio();
    if (!audio) setAudioError(true);
    audioRef.current = audio;
    setStarted(true);
    // Sound an opening fifth immediately so it is alive from gesture one.
    setTimeout(() => {
      stepTo(0);
      scheduleIdle();
    }, 60);
  }, [stepTo, scheduleIdle]);

  // ── User walk ──────────────────────────────────────────────────────────
  const walkTo = useCallback(
    (target: number) => {
      onUserAction();
      stepTo(target);
    },
    [onUserAction, stepTo],
  );

  // ── Temperament A/B toggle — re-sound the same fifth to compare ─────────
  const switchTemperament = useCallback(
    (idx: number) => {
      onUserAction();
      tempIdxRef.current = idx;
      setTempIdx(idx);
      // Re-sound the current landing so the ear hears the same place retuned.
      const from = (currentRef.current - 1 + RING_SIZE) % RING_SIZE;
      currentRef.current = from;
      stepTo((from + 1) % RING_SIZE);
    },
    [onUserAction, stepTo],
  );

  // ── Keyboard fallback (secondary) ──────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") walkTo((currentRef.current + 1) % RING_SIZE);
      else if (e.key === "ArrowLeft")
        walkTo((currentRef.current - 1 + RING_SIZE) % RING_SIZE);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, walkTo]);

  // ── Drag to rotate the ring in 3D ──────────────────────────────────────
  const onStagePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startOff: dragOffset,
      };
      draggingRef.current = false;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    },
    [dragOffset],
  );

  const onStagePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      if (Math.abs(dx) > 3) draggingRef.current = true;
      setDragOffset(dragRef.current.startOff + dx * 0.45);
    },
    [],
  );

  const onStagePointerUp = useCallback(() => {
    if (dragRef.current.active && draggingRef.current) onUserAction();
    dragRef.current.active = false;
  }, [onUserAction]);

  // ── Full teardown ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const temp = TEMPERAMENTS[tempIdx];
  const wolfActive = reading?.isWolf ?? false;

  // Ring rotation: bring the current tile to the front, plus manual drag.
  const ringY = -currentIndex * STEP_DEG + dragOffset;

  // ── Splash ─────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center gap-6 bg-[#08060d] px-6 py-12 text-center">
        <div className="max-w-xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-violet-300/80">
            the wolf ring
          </p>
          <h1 className="mb-4 font-semibold text-3xl leading-snug text-foreground">
            Walk the Circle of Fifths — <br className="hidden sm:block" />
            and Play the Wolf
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            An old temperament buys sweeter thirds and fifths than the piano by
            banking all its error into a single interval — the{" "}
            <span className="text-violet-300">wolf fifth</span>, which howls. Here
            that wolf is a place on a 3-D ring you can{" "}
            <span className="text-violet-300/95">walk into on purpose</span>.
            The wrong note is the point.
          </p>
        </div>

        <button
          onClick={handleBegin}
          className="min-h-[44px] rounded-full border border-violet-400/30 bg-violet-500/20 px-8 py-2.5 text-base text-violet-200 transition-colors hover:bg-violet-500/35"
        >
          Begin
        </button>

        {audioError && (
          <p className="text-sm text-violet-300">
            Web Audio unavailable — the ring will still move, silently.
          </p>
        )}

        <p className="max-w-sm text-sm text-muted-foreground">
          Tap tiles to walk fifth by fifth. Drag the ring to turn it. Flip the
          temperament to hear the wolf appear and vanish. Idle 5s and it walks
          itself — across the wolf.
        </p>

        <a
          href="/dream/1408-wolf-ring/README.md"
          className="absolute bottom-4 right-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Read the design notes ↗
        </a>
      </div>
    );
  }

  // ── Instrument ─────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#08060d]">
      <style>{`
        @keyframes wolfRecoil {
          0%   { transform: translateX(0) skewX(0deg) rotateZ(0deg); }
          28%  { transform: translateX(-7px) skewX(-6deg) rotateZ(-2deg); }
          62%  { transform: translateX(5px) skewX(4deg) rotateZ(1.4deg); }
          100% { transform: translateX(0) skewX(0deg) rotateZ(0deg); }
        }
        @keyframes wolfHalo {
          0%,100% { opacity: 0.55; }
          50%     { opacity: 0.9; }
        }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="z-10 flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-black/25 px-4 py-2.5">
        <span className="font-semibold text-xl text-foreground">The Wolf Ring</span>
        <div className="flex flex-wrap gap-1.5">
          {TEMPERAMENTS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => switchTemperament(i)}
              className={`min-h-[44px] rounded-full border px-4 py-2.5 text-sm transition-all ${
                tempIdx === i
                  ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3-D ring stage ──────────────────────────────────────────── */}
      <div
        ref={stageRef}
        className="relative flex-1 select-none"
        style={{
          perspective: "1000px",
          touchAction: "none",
          cursor: dragRef.current.active ? "grabbing" : "grab",
        }}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
      >
        {/* radial wash — cools in pure regions, warms at the wolf */}
        <div
          className="pointer-events-none absolute inset-0 transition-colors duration-700"
          style={{
            background: wolfActive
              ? "radial-gradient(circle at 50% 46%, rgba(244,63,94,0.16), rgba(8,6,13,0) 62%)"
              : "radial-gradient(circle at 50% 46%, rgba(16,185,129,0.10), rgba(8,6,13,0) 60%)",
          }}
        />

        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transformStyle: "preserve-3d",
            transform: `translate(-50%,-50%) scale(${scale}) rotateX(${TILT}deg) rotateY(${ringY}deg)`,
            transition: dragRef.current.active
              ? "none"
              : "transform 0.6s cubic-bezier(0.22,0.61,0.36,1)",
          }}
        >
          {RING.map((note, i) => {
            const net =
              (((i - currentIndex) * STEP_DEG + dragOffset) * Math.PI) / 180;
            const frontness = Math.cos(net); // 1 = facing viewer
            const opacity = 0.2 + 0.8 * Math.max(0, (frontness + 0.25) / 1.25);

            const isCurrent = i === currentIndex;
            const isWolfTile = i === WOLF_LO || i === WOLF_HI;
            const inActiveEdge =
              reading != null &&
              (i === reading.loIdx || i === reading.hiIdx);
            const litWolf = inActiveEdge && wolfActive;
            const litCalm = inActiveEdge && !wolfActive;

            let border = "rgba(255,255,255,0.14)";
            let bg = "rgba(255,255,255,0.05)";
            let glow = "none";
            let text = "rgba(255,255,255,0.62)";

            if (isWolfTile) {
              border = "rgba(244,63,94,0.5)";
              text = "rgba(253,164,175,0.9)";
            }
            if (litCalm) {
              border = "rgba(16,185,129,0.75)";
              bg = "rgba(16,185,129,0.16)";
              glow = "0 0 26px rgba(16,185,129,0.45)";
              text = "rgba(209,250,229,0.98)";
            }
            if (isCurrent && !litWolf) {
              border = "rgba(167,139,250,0.85)";
              bg = "rgba(139,92,246,0.22)";
              glow = "0 0 30px rgba(139,92,246,0.5)";
              text = "rgba(255,255,255,0.98)";
            }
            if (litWolf) {
              border = "rgba(251,113,133,0.95)";
              bg = "rgba(244,63,94,0.28)";
              glow = "0 0 40px rgba(244,63,94,0.7)";
              text = "rgba(255,228,230,1)";
            }

            const recoil =
              litWolf && !reduced
                ? "wolfRecoil 0.85s ease-in-out infinite"
                : "none";

            return (
              <button
                key={note.label}
                onClick={(e) => {
                  e.stopPropagation();
                  if (draggingRef.current) return; // it was a drag, not a tap
                  walkTo(i);
                }}
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: `translate(-50%,-50%) rotateY(${i * STEP_DEG}deg) translateZ(${RADIUS}px)`,
                  transformStyle: "preserve-3d",
                  opacity,
                  transition: "opacity 0.5s",
                }}
                aria-label={`Walk to ${note.label}`}
              >
                <span
                  className="flex flex-col items-center justify-center rounded-2xl border text-center backdrop-blur-sm"
                  style={{
                    width: 84,
                    height: 84,
                    borderColor: border,
                    background: bg,
                    boxShadow: glow,
                    animation: recoil,
                    transition:
                      "box-shadow 0.3s, background 0.3s, border-color 0.3s",
                  }}
                >
                  <span
                    className="font-semibold text-2xl leading-none"
                    style={{ color: text }}
                  >
                    {note.label}
                  </span>
                  {isWolfTile && (
                    <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-violet-300/80">
                      wolf
                    </span>
                  )}
                  {isCurrent && !isWolfTile && (
                    <span className="mt-1 font-mono text-[9px] uppercase tracking-widest text-violet-200/80">
                      here
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {isDemo && (
          <div className="pointer-events-none absolute left-3 top-3 flex select-none items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400/70" />
            walking itself · tap a tile to take over
          </div>
        )}
      </div>

      {/* ── Readout ─────────────────────────────────────────────────── */}
      <div className="z-10 flex-shrink-0 border-t border-border bg-black/25 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">fifth</span>
            <span
              className={
                wolfActive ? "text-lg text-violet-300" : "text-lg text-foreground"
              }
            >
              {reading
                ? `${RING[reading.loIdx].label} → ${RING[reading.hiIdx].label}`
                : "—"}
            </span>
            {wolfActive && (
              <span className="rounded bg-violet-500/25 px-2 py-0.5 text-xs uppercase tracking-widest text-violet-200">
                wolf
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">size</span>
            <span className="text-foreground">
              {reading ? `${reading.fifthCents.toFixed(1)}¢` : "—"}
            </span>
            <span
              className={
                reading && Math.abs(reading.centsFromPure) > 15
                  ? "text-violet-300/95"
                  : "text-violet-300/95"
              }
            >
              {reading ? `${fmtCents(reading.centsFromPure)}¢ vs pure` : ""}
            </span>
          </div>

          <div className="flex min-w-[180px] items-center gap-2">
            <span className="text-muted-foreground">beat</span>
            <span
              className={wolfActive ? "text-violet-300" : "text-foreground"}
            >
              {reading ? `${reading.beatHz.toFixed(1)} Hz` : "—"}
            </span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((reading?.beatHz ?? 0) / 18) * 100)}%`,
                  background: wolfActive
                    ? "linear-gradient(90deg, rgba(251,146,60,0.8), rgba(244,63,94,0.95))"
                    : "linear-gradient(90deg, rgba(16,185,129,0.7), rgba(52,211,153,0.9))",
                  animation:
                    wolfActive && !reduced ? "wolfHalo 0.85s ease-in-out infinite" : "none",
                }}
              />
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="truncate text-xs text-muted-foreground">
            <span className="text-muted-foreground">{temp.name}.</span> {temp.blurb}
          </p>
          <a
            href="/dream/1408-wolf-ring/README.md"
            className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            notes ↗
          </a>
        </div>
      </div>

      {audioError && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-sm text-violet-300">
          Web Audio unavailable — visuals only
        </div>
      )}

      <PrototypeNav slugs={["1408-wolf-ring"]} />
    </div>
  );
}
