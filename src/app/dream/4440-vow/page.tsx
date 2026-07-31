"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4440-vow — a conceptual-critical instrument about scarcity and attention.
//
//   Twelve suspended "vows" ring with real modal (struck-resonator) synthesis.
//   But the whole instrument holds a FINITE reserve of strikes — 108, ever —
//   persisted in localStorage across every visit. Each strike permanently
//   spends one. When the reserve reaches zero the constellation goes cold and
//   silent, and the only way back is a costly renewal ritual: hold the vow
//   unbroken for eight seconds. The point is to make a note COST something.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { VowEngine, buildScale, mulberry32, ARCHETYPES } from "./synth";
import { VowScene } from "./scene";
import {
  loadReserve,
  saveReserve,
  RESERVE_TOTAL,
  RESERVE_KEY,
} from "./store";

const SEED = 0x4440;
const RENEW_SECONDS = 8;

export default function VowPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VowEngine | null>(null);
  const sceneRef = useRef<VowScene | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const previewTimersRef = useRef<number[]>([]);

  // reserve (source of truth is the ref; state mirrors it for the UI)
  const countRef = useRef(RESERVE_TOTAL);
  const startedRef = useRef(false);
  const coldRef = useRef(false);

  // renew-hold plumbing (driven in the rAF loop, not React state)
  const holdActiveRef = useRef(false);
  const holdElapsedRef = useRef(0);
  const holdArcRef = useRef<SVGCircleElement>(null);

  const [count, setCount] = useState(RESERVE_TOTAL);
  const [started, setStarted] = useState(false);
  const [cold, setCold] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const total = RESERVE_TOTAL;

  // ── a real, reserve-spending strike ─────────────────────────────────────────
  const realStrike = useCallback((index: number, velocity = 1) => {
    const engine = engineRef.current;
    const scene = sceneRef.current;
    if (coldRef.current || countRef.current <= 0) return;

    void engine?.resume();
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
    }

    const next = countRef.current - 1;
    countRef.current = next;
    setCount(next);
    const persisted = saveReserve(next);
    if (!persisted) setEphemeral(true);

    const isLast = next === 0;
    scene?.markSpent(index);
    scene?.ring(index, isLast ? 1.4 : 0.85 + velocity * 0.3);
    scene?.setReserveFraction(next / total);
    // The farewell strike rings ~3× longer, then the field goes cold.
    engine?.strike(index, isLast ? 1 : 0.9, isLast ? 3 : 1);

    if (isLast) {
      coldRef.current = true;
      setCold(true);
      // let the long farewell ring out, then cool the field to near-black
      window.setTimeout(() => sceneRef.current?.setCold(true), 4200);
    }
  }, [total]);

  // ── the seeded self-demo (no reserve spent) ─────────────────────────────────
  const runPreview = useCallback(() => {
    const scene = sceneRef.current;
    const engine = engineRef.current;
    if (!scene) return;
    setPreviewing(true);
    void engine?.resume();
    const rng = mulberry32(SEED);
    // pick 3 distinct nodes deterministically
    const picks: number[] = [];
    while (picks.length < 3) {
      const k = Math.floor(rng() * 12);
      if (!picks.includes(k)) picks.push(k);
    }
    picks.forEach((idx, i) => {
      const id = window.setTimeout(() => {
        // ring the VISUALS always; audio only if the context is running.
        scene.ring(idx, 0.7);
        if (engineRef.current?.running) engineRef.current.strike(idx, 0.55, 1);
        if (i === picks.length - 1) {
          window.setTimeout(() => setPreviewing(false), 1600);
        }
      }, 500 + i * 1100);
      previewTimersRef.current.push(id);
    });
  }, []);

  // ── mount: reserve, engine, scene, loop ─────────────────────────────────────
  useEffect(() => {
    const handle = loadReserve();
    countRef.current = handle.count;
    coldRef.current = handle.count <= 0;
    setCount(handle.count);
    setCold(handle.count <= 0);
    setEphemeral(handle.ephemeral);

    const specs = buildScale(SEED);
    try {
      engineRef.current = new VowEngine(specs, SEED);
    } catch {
      engineRef.current = null;
    }

    let scene: VowScene | null = null;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        scene = new VowScene(canvas, SEED);
        sceneRef.current = scene;
        scene.setReserveFraction(handle.count / RESERVE_TOTAL);
        scene.setCold(handle.count <= 0);
        setWebglOk(true);
      } catch {
        scene = null;
        sceneRef.current = null;
        setWebglOk(false);
      }
    }

    // render / hold loop
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = lastTsRef.current
        ? Math.min(0.05, (ts - lastTsRef.current) / 1000)
        : 0.016;
      lastTsRef.current = ts;

      // renew-hold accumulation
      if (holdActiveRef.current) {
        holdElapsedRef.current += dt;
        const p = Math.min(1, holdElapsedRef.current / RENEW_SECONDS);
        if (holdArcRef.current) {
          const c = 2 * Math.PI * 20;
          holdArcRef.current.style.strokeDashoffset = String(c * (1 - p));
        }
        if (holdElapsedRef.current >= RENEW_SECONDS) {
          holdActiveRef.current = false;
          holdElapsedRef.current = 0;
          // renew the vow
          countRef.current = RESERVE_TOTAL;
          coldRef.current = false;
          setCount(RESERVE_TOTAL);
          setCold(false);
          if (!saveReserve(RESERVE_TOTAL)) setEphemeral(true);
          sceneRef.current?.reset();
          if (holdArcRef.current) {
            holdArcRef.current.style.strokeDashoffset = String(
              2 * Math.PI * 20,
            );
          }
        }
      }

      sceneRef.current?.frame(dt);
    };
    rafRef.current = requestAnimationFrame(loop);

    // only self-demo a fresh, full reserve — never spend the user's real strikes
    if (handle.count >= RESERVE_TOTAL && scene) {
      window.setTimeout(runPreview, 600);
    }

    const onResize = () => {
      const c = canvasRef.current;
      if (c && sceneRef.current) {
        sceneRef.current.resize(c.clientWidth, c.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);

    const timers = previewTimersRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      timers.forEach((id) => window.clearTimeout(id));
      sceneRef.current?.dispose();
      sceneRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [runPreview]);

  // ── pointer strikes on the canvas ───────────────────────────────────────────
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      void engineRef.current?.resume();
      const scene = sceneRef.current;
      if (!scene) return;
      const idx = scene.pick(e.clientX, e.clientY);
      if (idx >= 0) realStrike(idx, 1);
    },
    [realStrike],
  );

  // ── renew hold handlers ─────────────────────────────────────────────────────
  const startHold = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    void engineRef.current?.resume();
    holdActiveRef.current = true;
    holdElapsedRef.current = 0;
  }, []);
  const cancelHold = useCallback(() => {
    holdActiveRef.current = false;
    holdElapsedRef.current = 0;
    if (holdArcRef.current) {
      holdArcRef.current.style.strokeDashoffset = String(2 * Math.PI * 20);
    }
  }, []);

  const frac = count / total;
  const RING_C = 2 * Math.PI * 20;

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* full-viewport constellation */}
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointerDown}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: cold ? "default" : "pointer" }}
      />

      {/* WebGL fallback: still strike + hear the vows */}
      {!webglOk && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-destructive text-sm">
            WebGL is unavailable — the constellation can&apos;t render, but the
            vows still ring.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_unused, i) => i).map((i) => (
              <button
                key={i}
                disabled={cold}
                onPointerDown={(e) => {
                  e.preventDefault();
                  realStrike(i, 1);
                }}
                className="min-h-[44px] min-w-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── top: title + stake ──────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Vow
        </h1>
        <p className="text-base text-muted-foreground">
          Every strike is spent forever.
        </p>
      </div>

      {/* ── reserve counter (always visible) ────────────────────────────── */}
      <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-3 sm:right-7 sm:top-7">
        <div className="flex flex-col items-end">
          <span className="font-mono text-4xl tabular-nums text-foreground sm:text-5xl">
            {count}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            strikes left of {total}
          </span>
        </div>
        <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
          <circle
            cx="26"
            cy="26"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-border"
          />
          <circle
            cx="26"
            cy="26"
            r="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-primary"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - frac)}
          />
        </svg>
      </div>

      {/* ── preview / status badge ──────────────────────────────────────── */}
      {previewing && (
        <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-md border border-border bg-background/70 px-3 py-1 backdrop-blur-sm">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            preview · no strike spent
          </span>
        </div>
      )}
      {!previewing && !started && !cold && count > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-md border border-border bg-background/70 px-3 py-1 backdrop-blur-sm">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap a light — it costs one, forever
          </span>
        </div>
      )}

      {/* ── bottom bar: renew ritual + notes ────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
        <div className="flex flex-col gap-2">
          {cold && (
            <p className="max-w-xs text-sm text-destructive">
              The reserve is spent. The constellation is cold and silent. Hold
              the vow to renew it.
            </p>
          )}
          {ephemeral && (
            <p className="max-w-xs font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              storage blocked · reserve is session-only
            </p>
          )}
          {/* the hold-to-renew control — understated */}
          <button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            className="group relative flex min-h-[44px] touch-none items-center gap-3 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg width="26" height="26" viewBox="0 0 52 52" className="-rotate-90">
              <circle
                cx="26"
                cy="26"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                className="text-border"
              />
              <circle
                ref={holdArcRef}
                cx="26"
                cy="26"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                className="text-primary"
                strokeDasharray={2 * Math.PI * 20}
                strokeDashoffset={2 * Math.PI * 20}
              />
            </svg>
            <span>
              Renew the vow
              <span className="ml-1 hidden font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
                · hold {RENEW_SECONDS}s
              </span>
            </span>
          </button>
        </div>

        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* ── design-notes overlay ────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              A sound made scarce
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This instrument holds a finite reserve of{" "}
                <span className="text-foreground">{total} strikes</span> — ever.
                The count is persisted in your browser (
                <span className="font-mono text-xs">{RESERVE_KEY}</span>) and
                dwindles across every visit. Each tap of a vow permanently spends
                one; the light contracts and the field cools. At zero the
                constellation goes silent, and the only way back is penance: hold{" "}
                <span className="text-foreground">Renew the vow</span> for a full{" "}
                {RENEW_SECONDS} unbroken seconds. Let go early and the ritual
                resets to nothing.
              </p>
              <p>
                Each vow is a{" "}
                <span className="text-foreground">
                  modal struck-resonator
                </span>{" "}
                — a bank of {ARCHETYPES.length} inharmonic body-types (bell,
                glass, bar, bowl), each partial an oscillator whose decay
                time-constant τ = Q/(π·f) shortens with frequency, so bright high
                modes die first, exactly as struck metal and glass do. No
                samples, no beeps.
              </p>
              <p>
                In the lineage of art with a genuine cost — Tehching Hsieh&apos;s
                year-long durational vows, and the conceptual frame of a
                recording you cannot hear without paying for it. On sound:
                modal / banded-waveguide synthesis, after Julius O. Smith,{" "}
                <span className="italic">Physical Audio Signal Processing</span>.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
