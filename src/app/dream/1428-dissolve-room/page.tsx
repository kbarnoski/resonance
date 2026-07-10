"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  buildGrid,
  cellVisual,
  updateProgress,
  effectivePhase,
  lightAmount,
  cameraPush,
  phaseOf,
  PHASES,
  type Cell,
  type Phase,
} from "./lattice";
import { startAudio, type DissolveAudio } from "./audio";

type Status = "idle" | "running";

const FORMED_PREVIEW = 0.04; // the still, gently-alive "formed lattice" preview

export default function DissolveRoomPage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<HTMLDivElement[]>([]);
  const cellsRef = useRef<Cell[]>([]);
  const bloomRef = useRef<HTMLDivElement | null>(null);
  const lightRef = useRef<HTMLDivElement | null>(null);

  const audioRef = useRef<DissolveAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  // Live state written by the RAF loop (no React re-render per frame).
  const progressRef = useRef<number>(FORMED_PREVIEW);
  const leanHoldRef = useRef<number>(0); // smoothed pointer-hold recovery
  const holdTargetRef = useRef<number>(0); // 0/1 target from pointerdown/up
  const tiltLeanRef = useRef<number>(0); // recovery contributed by device tilt
  const steerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; px: number; py: number }>({
    active: false,
    px: 0,
    py: 0,
  });
  const orientationSeenRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<Status>("idle");
  const [phase, setPhase] = useState<Phase>("forming");
  const [elapsed, setElapsed] = useState<string>("00:00");
  const [driftSpeed, setDriftSpeed] = useState<number>(1);
  const driftRef = useRef<number>(1);
  const [usingFallback, setUsingFallback] = useState<boolean>(true);
  const [reduced, setReduced] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);

  useEffect(() => {
    driftRef.current = driftSpeed;
  }, [driftSpeed]);

  // Build the grid once.
  if (cellsRef.current.length === 0) {
    cellsRef.current = buildGrid();
  }

  const setCellRef = useCallback((el: HTMLDivElement | null, i: number) => {
    if (el) cellRefs.current[i] = el;
  }, []);

  // ── The render loop (mutates DOM directly; never re-renders React) ─────────
  const frame = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    let dt = (ts - last) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.1) dt = 0.1; // guard against tab-switch jumps

    const reducedMotion = reducedRef.current;

    // Irreversible clock (frozen to a formed preview under reduced-motion).
    if (!reducedMotion) {
      progressRef.current = updateProgress(
        progressRef.current,
        driftRef.current,
        dt,
      );
    } else {
      progressRef.current = FORMED_PREVIEW;
    }
    const progress = progressRef.current;

    // Smooth the pointer-hold recovery toward its target.
    const holdRate = holdTargetRef.current > leanHoldRef.current ? 2.6 : 1.6;
    leanHoldRef.current +=
      (holdTargetRef.current - leanHoldRef.current) * Math.min(1, holdRate * dt);
    const lean = Math.min(1, leanHoldRef.current + tiltLeanRef.current * 0.7);

    // Per-cell visuals. Transform + opacity every frame; colour throttled.
    frameRef.current++;
    const doColor = frameRef.current % 4 === 0;
    const cells = cellsRef.current;
    const els = cellRefs.current;
    for (let i = 0; i < cells.length; i++) {
      const el = els[i];
      if (!el) continue;
      const v = cellVisual(cells[i], progress, lean);
      el.style.transform = v.transform;
      el.style.opacity = v.opacity.toFixed(3);
      if (doColor) el.style.backgroundColor = v.color;
    }

    // Far light + bloom overlay grow as the tunnel opens.
    const light = lightAmount(progress, lean);
    if (lightRef.current) {
      lightRef.current.style.opacity = (0.15 + light * 0.85).toFixed(3);
      const s = (0.5 + light * 2.2).toFixed(3);
      lightRef.current.style.transform = `translate(-50%, -50%) scale(${s})`;
    }
    if (bloomRef.current) {
      bloomRef.current.style.opacity = (light * 0.7).toFixed(3);
    }

    // Camera: slow sub-Hz rotation + drift toward the light, steer offsets.
    if (stageRef.current) {
      const tSec = ts / 1000;
      const spinY = Math.sin(tSec * 0.05) * 14 + steerRef.current.x;
      const spinX = Math.cos(tSec * 0.037) * 8 + steerRef.current.y;
      const push = cameraPush(progress, lean);
      stageRef.current.style.transform =
        `translateZ(${push.toFixed(1)}px) rotateX(${spinX.toFixed(2)}deg) rotateY(${spinY.toFixed(2)}deg)`;
    }

    // Audio follows the true clock (lean recovers tuning, not the clock).
    audioRef.current?.update(progress, lean, dt);

    // Throttled readout (phase + mm:ss) — a couple of setStates a second.
    if (frameRef.current % 20 === 0) {
      const p = reducedMotion
        ? phaseOf(FORMED_PREVIEW)
        : effectivePhase(progress, lean);
      setPhase((prev) => (prev === p ? prev : p));
      const secs = Math.floor((performance.now() - startWallRef.current) / 1000);
      const mm = String(Math.floor(secs / 60)).padStart(2, "0");
      const ss = String(secs % 60).padStart(2, "0");
      const stamp = `${mm}:${ss}`;
      setElapsed((prev) => (prev === stamp ? prev : stamp));
    }

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── Input: device orientation (tilt) + pointer hold; desktop drag fallback ─
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null && e.gamma == null) return;
      if (!orientationSeenRef.current) {
        orientationSeenRef.current = true;
        setUsingFallback(false);
      }
      // Leaning the device forward (beta above a neutral ~35°) = lean in.
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      const leanIn = Math.max(0, Math.min(1, (beta - 20) / 45));
      tiltLeanRef.current = leanIn;
      steerRef.current = {
        x: Math.max(-30, Math.min(30, gamma * 0.6)),
        y: Math.max(-20, Math.min(20, (beta - 45) * 0.3)),
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      holdTargetRef.current = 1; // hold = pull back toward "more formed"
      dragRef.current = { active: true, px: e.clientX, py: e.clientY };
    };
    const onPointerUp = () => {
      holdTargetRef.current = 0;
      dragRef.current.active = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      // Desktop steer (only meaningful without device orientation).
      if (!orientationSeenRef.current) {
        const dx = e.clientX - dragRef.current.px;
        const dy = e.clientY - dragRef.current.py;
        steerRef.current = {
          x: Math.max(-30, Math.min(30, steerRef.current.x + dx * 0.08)),
          y: Math.max(-20, Math.min(20, steerRef.current.y - dy * 0.06)),
        };
        dragRef.current.px = e.clientX;
        dragRef.current.py = e.clientY;
      }
    };

    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 800);
    }
  }, []);

  // Start the visual loop immediately (silent preview). Audio waits for Begin.
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    setReduced(reducedRef.current);
    startWallRef.current = performance.now();
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
    return teardown;
  }, [frame, teardown]);

  const begin = useCallback(async () => {
    if (status === "running") return;
    // Reset the clock so the arc starts from "formed" at Begin.
    if (!reducedRef.current) progressRef.current = FORMED_PREVIEW;
    startWallRef.current = performance.now();

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      audioRef.current = startAudio(ctx);
    } catch {
      // Audio unavailable — the visual arc still runs (never blank).
      ctxRef.current = null;
      audioRef.current = null;
    }

    // Best-effort iOS permission prompt (never throws).
    try {
      const dom = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (dom && typeof dom.requestPermission === "function") {
        await dom.requestPermission().catch(() => undefined);
      }
    } catch {
      /* not supported */
    }

    setStatus("running");
  }, [status]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      {/* ── The 3D room ─────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ perspective: "900px", perspectiveOrigin: "50% 45%" }}
        aria-hidden
      >
        <div
          ref={stageRef}
          className="absolute left-1/2 top-1/2"
          style={{
            transformStyle: "preserve-3d",
            transform: "translateZ(0px)",
            willChange: "transform",
          }}
        >
          {/* Far light, deep on -Z */}
          <div
            ref={lightRef}
            className="absolute left-0 top-0"
            style={{
              width: 260,
              height: 260,
              marginLeft: -130,
              marginTop: -130,
              transform: "translate(-50%, -50%) scale(0.5)",
              transformStyle: "preserve-3d",
              translate: "0 0 -900px",
              background:
                "radial-gradient(circle, rgba(255,244,214,0.95) 0%, rgba(214,180,255,0.55) 35%, rgba(120,90,200,0.15) 60%, transparent 72%)",
              opacity: 0.15,
              filter: "blur(2px)",
            }}
          />
          {cellsRef.current.map((_, i) => (
            <div
              key={i}
              ref={(el) => setCellRef(el, i)}
              className="absolute left-0 top-0"
              style={{
                width: 26,
                height: 26,
                marginLeft: -13,
                marginTop: -13,
                borderRadius: 6,
                backgroundColor: "hsl(258, 72%, 58%)",
                boxShadow:
                  "0 0 10px 1px rgba(180,160,255,0.35), inset 0 0 6px rgba(255,255,255,0.25)",
                opacity: 0.9,
                willChange: "transform, opacity",
              }}
            />
          ))}
        </div>
      </div>

      {/* Screen-space bloom that grows as the tunnel opens */}
      <div
        ref={bloomRef}
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(255,245,220,0.9) 0%, rgba(210,180,255,0.35) 30%, transparent 60%)",
          opacity: 0,
          mixBlendMode: "screen",
        }}
        aria-hidden
      />

      {/* ── Text + controls overlay ──────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-5 sm:p-8">
        <header className="pointer-events-auto max-w-2xl">
          <h1 className="font-serif text-3xl font-semibold text-white sm:text-4xl">
            The Dissolve
          </h1>
          <p className="mt-2 text-base leading-relaxed text-white/80">
            A room you cannot leave. A solid glowing lattice loosens over five
            minutes and tunnels toward a light — tuned so it was never quite in
            tune, and grinding further out as it comes apart. You don&rsquo;t
            play notes; you play the arc. Lean in or hold to resist the
            dissolve. You never reverse it.
          </p>

          {status === "idle" ? (
            <button
              type="button"
              onClick={begin}
              className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-violet-500/20 px-6 py-2.5 text-base font-medium text-violet-300 ring-1 ring-inset ring-violet-400/40 transition-colors hover:bg-violet-500/30"
            >
              Begin the descent
            </button>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <PhaseReadout phase={reduced ? "forming" : phase} elapsed={elapsed} />
            </div>
          )}

          {reduced && (
            <p className="mt-3 max-w-xl text-base text-rose-300">
              Reduced-motion is on, so the arc is frozen to a formed-but-gently-
              alive lattice — no accumulating dissolve, no brightness pulsing.
            </p>
          )}
          {status === "running" && usingFallback && !reduced && (
            <p className="mt-3 max-w-xl text-base text-rose-300">
              No device tilt detected — using the desktop fallback: drag to steer
              the room, and press-and-hold anywhere to pull back toward a more
              formed lattice.
            </p>
          )}
        </header>

        {status === "running" && (
          <div className="pointer-events-auto mb-16 max-w-md rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-sm">
            <label
              htmlFor="drift"
              className="flex items-center justify-between text-base text-white/80"
            >
              <span>Drift speed</span>
              <span className="text-white/55">{driftSpeed.toFixed(2)}×</span>
            </label>
            <input
              id="drift"
              type="range"
              min={0.4}
              max={2.2}
              step={0.05}
              value={driftSpeed}
              onChange={(e) => setDriftSpeed(parseFloat(e.target.value))}
              className="mt-2 w-full accent-violet-400"
            />
            <p className="mt-2 text-base text-white/75">
              {usingFallback
                ? "Drag to steer · press-and-hold to resist."
                : "Tilt to steer · lean in / hold to resist."}{" "}
              The dissolution proceeds on its own if you do nothing.
            </p>
          </div>
        )}
      </div>

      {/* Design notes affordance */}
      <div className="pointer-events-auto absolute right-4 top-4 z-20">
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-full border border-white/15 bg-black/50 px-4 py-2.5 text-base text-white/75 backdrop-blur-sm transition-colors hover:text-white"
        >
          {showNotes ? "Close" : "Design notes"}
        </button>
        {showNotes && (
          <div className="mt-2 max-w-xs rounded-2xl border border-white/10 bg-black/80 p-4 text-base leading-relaxed text-white/80 backdrop-blur">
            <p className="text-white/95">
              Long-form &amp; irreversible: one monotonic clock, ~5 min. The
              phases {PHASES.join(" · ")} accumulate — minute 5 is not minute 1.
            </p>
            <p className="mt-2">
              The tuning is the point. Inharmonic Risset bell partials, Railsback
              octave-stretch that grows with the dissolve, chorus widening cents
              → tens of cents. It drifts further out of consonance, never back.
            </p>
            <p className="mt-2 text-white/75">
              After Blackmore&rsquo;s <em>Dying to Live</em> (1993) and the
              DMT-models-NDE finding: the tunnel → void → light is a universal,
              brain-generated scaffold; only its content is personal.
            </p>
          </div>
        )}
      </div>

      <PrototypeNav slugs={["1428-dissolve-room"]} />
    </main>
  );
}

function PhaseReadout({ phase, elapsed }: { phase: Phase; elapsed: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-base">
        {PHASES.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            <span
              className={
                p === phase ? "text-violet-300" : "text-white/55"
              }
            >
              {p}
            </span>
            {i < PHASES.length - 1 && <span className="text-white/55">·</span>}
          </span>
        ))}
        <span className="ml-1 border-l border-white/15 pl-3 tabular-nums text-white/55">
          {elapsed}
        </span>
      </div>
    </div>
  );
}
