"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { EarRenderer } from "./shader";
import { EarAudio } from "./audio";
import {
  buildResonances,
  alignment,
  mulberry32,
  SEED,
  type Resonance,
} from "./resonances";

// ── mapping constants (see README design-notes) ─────────────────────────────
const HOME_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const NUDGE = 0.02; // arrow-key focus step (ribbon units)
const DWELL_MS = 350; // dwell time to lock a fragment
const DWELL_MOVE_TOL = 0.007; // focus move/frame under which it counts as dwelling
const ALIGN_MIN = 0.22; // alignment that counts as "over" a resonance
const IDLE_MS = 5000; // untouched time before the self-demo takes over
const IDLE_INTERVAL_MS = 5500; // gap between auto-finds
const IDLE_EASE = 0.045; // how fast the idle focus glides to its target

type Phase = "idle" | "live";

export default function EarOfStaticPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [reduced, setReduced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [idleHint, setIdleHint] = useState(false);
  const [resolvingLabel, setResolvingLabel] = useState<string | null>(null);

  // deterministic resonance model (identical to the audio engine's copy)
  const resonancesRef = useRef<Resonance[]>([]);
  if (resonancesRef.current.length === 0) {
    resonancesRef.current = buildResonances(SEED);
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EarRenderer | null>(null);
  const audioRef = useRef<EarAudio | null>(null);

  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const startedRef = useRef(false);
  const reducedRef = useRef(false);

  const focusRef = useRef({ x: 0.5 });
  const prevFocusRef = useRef(0.5);
  const dwellRef = useRef(0); // ms accumulated over a resonance
  const heldRef = useRef(false); // space-lock: hold the current weave
  const lastInteractRef = useRef(0);
  const idleActiveRef = useRef(false);
  const idleNextRef = useRef(0);
  const idleTargetRef = useRef(0.5);
  const autoRndRef = useRef<() => number>(mulberry32(0x5eed));

  // fallback SVG refs (used only when WebGL2 is unavailable)
  const fbFocusRef = useRef<SVGGElement | null>(null);
  const fbTickRefs = useRef<(SVGRectElement | null)[]>([]);

  const markInteract = useCallback((now: number) => {
    lastInteractRef.current = now;
    if (idleActiveRef.current) {
      idleActiveRef.current = false;
      setIdleHint(false);
    }
    heldRef.current = false;
  }, []);

  const setFocusFromClientX = useCallback((clientX: number) => {
    const el = canvasRef.current ?? containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / Math.max(1, r.width);
    focusRef.current.x = Math.max(0, Math.min(1, x));
  }, []);

  const onPointer = useCallback(
    (clientX: number) => {
      if (!startedRef.current) return;
      setFocusFromClientX(clientX);
      markInteract(performance.now());
    },
    [setFocusFromClientX, markInteract],
  );

  const begin = useCallback(async () => {
    if (startedRef.current) return;
    setError(null);
    const audio = new EarAudio();
    audioRef.current = audio;
    try {
      await audio.start();
    } catch {
      setError("Audio could not start in this browser. Try tapping Begin again.");
      audioRef.current = null;
      return;
    }
    const now = performance.now();
    startedRef.current = true;
    lastInteractRef.current = now;
    idleNextRef.current = now + IDLE_MS + 400;
    autoRndRef.current = mulberry32(0x5eed);
    setPhase("live");
  }, []);

  // reduced-motion detection
  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    reducedRef.current = r;
  }, []);

  // create the WebGL renderer + keep the canvas sized
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const renderer = EarRenderer.create(canvas);
    if (!renderer) {
      setWebglOk(false);
      return;
    }
    rendererRef.current = renderer;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const applySize = () => {
      const w = container.clientWidth;
      const h = Math.max(220, Math.round(w * 0.42));
      canvas.style.height = `${h}px`;
      renderer.resize(w * dpr, h * dpr);
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // global keyboard control (works with no pointer)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!startedRef.current) return;
      const key = ev.key.toLowerCase();
      const now = performance.now();

      const hk = HOME_KEYS.indexOf(key);
      if (hk >= 0) {
        ev.preventDefault();
        focusRef.current.x = (hk + 0.5) / HOME_KEYS.length;
        markInteract(now);
        return;
      }
      if (
        key === "arrowleft" ||
        key === "arrowright" ||
        key === "arrowup" ||
        key === "arrowdown"
      ) {
        ev.preventDefault();
        const dir = key === "arrowleft" || key === "arrowdown" ? -1 : 1;
        focusRef.current.x = Math.max(
          0,
          Math.min(1, focusRef.current.x + dir * NUDGE),
        );
        markInteract(now);
        return;
      }
      if (key === " " || key === "enter") {
        ev.preventDefault();
        markInteract(now);
        // lock the current dwell into a held consonant weave
        heldRef.current = true;
        dwellRef.current = DWELL_MS;
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markInteract]);

  // pick a resonance for the idle self-demo to glide toward
  const runAutoTarget = useCallback((): number => {
    const res = resonancesRef.current;
    const rnd = autoRndRef.current;
    const pick = res[Math.floor(rnd() * res.length)];
    return pick ? pick.x : 0.5;
  }, []);

  // the one animation loop
  useEffect(() => {
    startTimeRef.current = performance.now();
    let lastFrame = startTimeRef.current;

    const frame = (nowMs: number) => {
      const t = (nowMs - startTimeRef.current) / 1000;
      const dt = Math.min(64, nowMs - lastFrame);
      lastFrame = nowMs;
      const res = resonancesRef.current;

      if (startedRef.current) {
        // idle self-demo — glides to a resonance and holds when untouched.
        if (nowMs - lastInteractRef.current > IDLE_MS) {
          if (!idleActiveRef.current) {
            idleActiveRef.current = true;
            setIdleHint(true);
            idleTargetRef.current = runAutoTarget();
            idleNextRef.current = nowMs + IDLE_INTERVAL_MS;
          }
          if (nowMs >= idleNextRef.current) {
            idleTargetRef.current = runAutoTarget();
            const jitter = reducedRef.current ? 0 : autoRndRef.current() * 1200;
            idleNextRef.current = nowMs + IDLE_INTERVAL_MS + jitter;
          }
          // ease focus toward the target (slower under reduced motion)
          const ease = reducedRef.current ? IDLE_EASE * 0.5 : IDLE_EASE;
          focusRef.current.x +=
            (idleTargetRef.current - focusRef.current.x) * ease;
        }
      }

      const fx = focusRef.current.x;
      const move = Math.abs(fx - prevFocusRef.current);
      prevFocusRef.current = fx;

      // alignments + strongest resonance
      let topAlign = 0;
      let topRes: Resonance | null = null;
      const aligns: number[] = new Array(res.length);
      for (let i = 0; i < res.length; i++) {
        const a = alignment(fx, res[i].x);
        aligns[i] = a;
        if (a > topAlign) {
          topAlign = a;
          topRes = res[i];
        }
      }

      // dwell charge: builds when parked over a resonance, decays when sweeping.
      if (heldRef.current) {
        dwellRef.current = DWELL_MS;
      } else if (topAlign > ALIGN_MIN && move < DWELL_MOVE_TOL) {
        dwellRef.current = Math.min(DWELL_MS, dwellRef.current + dt);
      } else if (move >= DWELL_MOVE_TOL) {
        dwellRef.current = Math.max(0, dwellRef.current - dt * 1.4);
      }
      const dwell = dwellRef.current / DWELL_MS;

      if (startedRef.current) {
        audioRef.current?.setFocus(fx, dwell);
      }

      // ridge intensity: ring rises with alignment, blooms with dwell
      const resAlign = aligns.map((a) => a * (0.5 + 0.5 * dwell));

      // resolving label (throttled by React state; cheap string)
      const label =
        topAlign > 0.55 && startedRef.current
          ? `resolving · ${Math.round(topRes ? topRes.freq : 0)} Hz`
          : null;
      setResolvingLabel((prev) => (prev === label ? prev : label));

      // draw
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.render({
          time: t,
          focusX: fx,
          dwell,
          reduced: reducedRef.current,
          resX: res.map((r) => r.x),
          resAlign,
        });
      } else {
        // SVG fallback update
        const fg = fbFocusRef.current;
        if (fg) fg.setAttribute("transform", `translate(${(fx * 1000).toFixed(1)},0)`);
        for (let i = 0; i < res.length; i++) {
          const tick = fbTickRefs.current[i];
          if (tick) {
            const a = resAlign[i];
            tick.setAttribute("opacity", (0.12 + 0.88 * a).toFixed(3));
            tick.setAttribute("width", (2 + 10 * a).toFixed(1));
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [runAutoTarget]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const res = resonancesRef.current;

  return (
    <main className="min-h-screen bg-[#05040a] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="font-serif text-2xl text-white sm:text-3xl">
            Ear of Static
          </h1>
          <p className="mt-1 text-base text-white/80">
            Sweep a listening focus across a bed of pure noise. Dwell, and a
            hidden melody resolves itself out of the hiss — as if it was ringing
            there all along.
          </p>
          <p className="mt-2 text-base text-violet-300">
            Drag across the ribbon or press{" "}
            <code className="rounded bg-white/10 px-1 text-violet-200">A … ;</code>{" "}
            to jump between bands. Hold still over a resonance to let it ring out.
          </p>
        </header>

        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl border border-violet-400/20 bg-black"
        >
          {/* WebGL spectral-ear field */}
          <canvas
            ref={canvasRef}
            className="block w-full touch-none select-none"
            style={{ height: 300 }}
            aria-label="A dim field of hiss in which tuned resonances ring out under a sweeping listening focus."
            onPointerMove={(e) => onPointer(e.clientX)}
            onPointerDown={(e) => onPointer(e.clientX)}
          />

          {/* SVG fallback (only when WebGL2 is unavailable) */}
          {!webglOk && (
            <svg
              viewBox="0 0 1000 300"
              className="absolute inset-0 h-full w-full touch-none select-none"
              role="img"
              aria-label="Focus meter fallback: a listening ribbon with resonance markers."
              onPointerMove={(e) => onPointer(e.clientX)}
              onPointerDown={(e) => onPointer(e.clientX)}
            >
              <rect x="0" y="0" width="1000" height="300" fill="#0a0814" />
              <rect x="0" y="140" width="1000" height="20" fill="#1a1630" />
              {res.map((r, i) => (
                <rect
                  key={r.id}
                  ref={(el) => {
                    fbTickRefs.current[i] = el;
                  }}
                  x={r.x * 1000 - 3}
                  y={90}
                  width={4}
                  height={120}
                  rx={2}
                  fill="#c4b5fd"
                  opacity={0.12}
                />
              ))}
              <g ref={fbFocusRef} transform="translate(500,0)">
                <line x1={0} y1={40} x2={0} y2={260} stroke="#a78bfa" strokeWidth={2} />
                <circle cx={0} cy={150} r={7} fill="#ede9fe" />
              </g>
            </svg>
          )}

          {/* pre-Begin overlay */}
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-[1px]">
              <p className="max-w-sm px-6 text-center text-base text-white/85">
                Seven resonances are already ringing inside the static, silenced.
                Begin, then sweep your ear across them.
              </p>
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-white transition-colors hover:bg-violet-400"
              >
                Begin
              </button>
            </div>
          )}

          {/* status chips */}
          {phase === "live" && (
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
              {resolvingLabel && (
                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-sm text-amber-200">
                  {resolvingLabel}
                </span>
              )}
              {idleHint && (
                <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-violet-200">
                  listening on its own — move to take over
                </span>
              )}
            </div>
          )}
        </div>

        {/* controls / help */}
        <div className="mt-4 space-y-2">
          <p className="text-base text-white/75">
            Pointer or touch to sweep;{" "}
            <code className="rounded bg-white/10 px-1 text-violet-200">A S D F G H J K L ;</code>{" "}
            jump to preset bands, arrows nudge,{" "}
            <span className="text-white/90">space</span> locks the current weave.
          </p>
        </div>

        {reduced && (
          <p className="mt-3 text-base text-amber-300/95">
            Reduced-motion is on — the hiss animation and luminance drift are
            frozen; resonances still ring out under your focus.
          </p>
        )}
        {!webglOk && (
          <p className="mt-3 text-base text-amber-300/95">
            WebGL2 is unavailable — showing a focus-meter fallback. The audio
            instrument still plays in full.
          </p>
        )}
        {error && <p className="mt-3 text-base text-rose-300">{error}</p>}
      </div>

      <PrototypeNav slugs={["1396-apophenia-field", "1392-phase-loom"]} />
    </main>
  );
}
