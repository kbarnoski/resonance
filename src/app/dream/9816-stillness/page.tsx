"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 9816 · Stillness — an ANTI-instrument.
//
//   "What if the instrument rewarded STILLNESS instead of action?"
//
//   The gate is INVERTED. Pointer/touch MOTION is silence; holding perfectly
//   still is what plays it. A stillness meter `s ∈ [0,1]` rises slowly while you
//   are calm and is knocked down sharply the instant you move. As `s` climbs, a
//   just-intonation drone blooms partial by partial and a cool luminous mandala
//   grows from a point to a full field. You cannot "play" it by doing things —
//   it plays when you stop.
//
//   A muted phone left untouched IS perfectly still, so the field auto-blooms to
//   full on load (seeded, deterministic breathing keeps it alive). Audio waits
//   for the first gesture, as browsers require.
//
//   REFS  Pauline Oliveros · Deep Listening (attention as the instrument);
//         John Cage · 4'33" (the frame around silence); the attention-economy
//         critique of rewarding non-action.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { renderBloom } from "./bloom";
import { startStillnessDrone, type StillnessDrone } from "./audio";

// How movement maps to the meter.
const KNOCK_PER_PX = 0.0045; // pixels moved × this = drop in `s` (a flick silences it)
const TAP_KNOCK = 0.18; // a click / key / scroll costs this much stillness
const RISE_SECONDS = 6.5; // seconds of calm to climb from 0 → 1
const MOVE_GRACE_MS = 130; // must be idle this long before `s` starts rising again

export default function StillnessPage() {
  const [begun, setBegun] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [displayS, setDisplayS] = useState(1); // idle = perfectly still = full

  // rAF-loop refs (mutated without re-render).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<ReturnType<typeof createSafeMaster> | null>(null);
  const droneRef = useRef<StillnessDrone | null>(null);

  const sRef = useRef(1); // start fully bloomed (untouched = maximally still)
  const disturbRef = useRef(0);
  const lastMoveRef = useRef(-Infinity);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const startRef = useRef(0);
  const lastHudRef = useRef(0);

  // Register motion → knock the meter down. Sharp fall, immediate.
  const applyMotion = useCallback((dist: number, nowMs: number) => {
    const drop = Math.min(0.9, dist * KNOCK_PER_PX);
    sRef.current = Math.max(0, sRef.current - drop);
    disturbRef.current = Math.min(1, disturbRef.current + drop * 2 + 0.05);
    lastMoveRef.current = nowMs;
  }, []);

  // Input + animation loop. Runs whether or not audio has started.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const reduced = prefersReducedMotion();

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Motion listeners ──────────────────────────────────────────────
    const onPointerMove = (ev: PointerEvent) => {
      const p = lastPosRef.current;
      const now = performance.now();
      if (p) applyMotion(Math.hypot(ev.clientX - p.x, ev.clientY - p.y), now);
      lastPosRef.current = { x: ev.clientX, y: ev.clientY };
    };
    const onTouchMove = (ev: TouchEvent) => {
      const tch = ev.touches[0];
      if (!tch) return;
      const p = lastPosRef.current;
      const now = performance.now();
      if (p) applyMotion(Math.hypot(tch.clientX - p.x, tch.clientY - p.y), now);
      lastPosRef.current = { x: tch.clientX, y: tch.clientY };
    };
    const tapKnock = () => {
      const now = performance.now();
      sRef.current = Math.max(0, sRef.current - TAP_KNOCK);
      disturbRef.current = Math.min(1, disturbRef.current + 0.3);
      lastMoveRef.current = now;
    };
    const onLeave = () => {
      lastPosRef.current = null; // don't count re-entry as one giant jump
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("pointerdown", tapKnock, { passive: true });
    window.addEventListener("keydown", tapKnock);
    window.addEventListener("wheel", tapKnock, { passive: true });
    window.addEventListener("scroll", tapKnock, { passive: true });
    window.addEventListener("pointerout", onLeave, { passive: true });

    startRef.current = performance.now();
    let prev = startRef.current;

    const frame = () => {
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - prev) / 1000);
      prev = nowMs;
      const t = (nowMs - startRef.current) / 1000;

      // Rise only after a grace period of true calm — slow and worth chasing.
      if (nowMs - lastMoveRef.current > MOVE_GRACE_MS) {
        sRef.current = Math.min(1, sRef.current + dt / RISE_SECONDS);
      }
      disturbRef.current = Math.max(0, disturbRef.current - dt * 1.6);

      const s = sRef.current;
      droneRef.current?.setStillness(s);
      renderBloom(g, w, h, { s, t, disturb: disturbRef.current, reduced });

      // Throttle the HUD readout to ~8 fps.
      if (nowMs - lastHudRef.current > 120) {
        lastHudRef.current = nowMs;
        setDisplayS(s);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerdown", tapKnock);
      window.removeEventListener("keydown", tapKnock);
      window.removeEventListener("wheel", tapKnock);
      window.removeEventListener("scroll", tapKnock);
      window.removeEventListener("pointerout", onLeave);
    };
  }, [applyMotion]);

  // Teardown audio on unmount.
  useEffect(() => {
    return () => {
      droneRef.current?.stop();
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  const begin = useCallback(async () => {
    if (begun) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        setAudioError("No Web Audio support — the visual bloom still responds.");
        setBegun(true);
        return;
      }
      const ctx = new AC();
      await ctx.resume();
      const master = createSafeMaster(ctx, { gain: 0.16 });
      const drone = startStillnessDrone(ctx, master.input);
      ctxRef.current = ctx;
      masterRef.current = master;
      droneRef.current = drone;
      setBegun(true);
    } catch {
      setAudioError("Audio could not start — the visual bloom still responds.");
      setBegun(true);
    }
  }, [begun]);

  const pct = Math.round(displayS * 100);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 pb-24">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            9816 · anti-instrument
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Stillness</h1>
          <p className="max-w-prose text-base text-muted-foreground">
            An instrument with the gate inverted. Motion is silence; holding
            perfectly still is what plays it. Hold, and a just-intonation chord
            blooms voice by voice while a field of light grows from a single
            point. The reward belongs only to attention held.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {!begun ? (
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Begin
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              listening · stillness {pct}%
            </span>
          )}
          {!begun && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              stillness {pct}%
            </span>
          )}
        </div>

        {audioError && (
          <p className="text-base text-destructive">{audioError}</p>
        )}

        <div className="relative h-[62vh] min-h-[380px] w-full overflow-hidden rounded-lg border border-border bg-background">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>

        <p className="text-base text-muted-foreground">
          This instrument rewards stillness. Move, and it goes quiet. Do nothing,
          and it slowly gives you everything.
        </p>

        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            after Oliveros · Cage
          </p>
          <p className="max-w-prose text-base text-muted-foreground">
            A meditation trainer disguised as an instrument, and a small critique
            of an attention economy that pays only for motion. The chord is pure
            just intonation; the light is a seeded breathing field, alive even
            when no one has touched it.
          </p>
        </section>
      </div>

      <PrototypeNav slugs={["9816-stillness"]} />
    </main>
  );
}
