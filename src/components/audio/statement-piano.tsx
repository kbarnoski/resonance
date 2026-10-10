"use client";
/**
 * STATEMENT PIANO — the set-start card's particle field forms Karel's old 1919
 * upright, candles and fire on top (Karel 2026-10-09), behind "Resonance".
 *
 * Zero-glitch rules (statement-piano-plan.ts holds the clock):
 *  • the SHARED engine + its pre-warmed programs — no new GL context, nothing
 *    compiled; on a cold page (programs still warming) the piano is skipped;
 *  • the image is decoded + importance-sampled in the decode worker at page
 *    load; the card only uploads it, on black, before the text fades in;
 *  • it gathers 0.7 → ~3 s and BURNS (living fire, draw-only motion) until
 *    pre-start − 2.1 s, then dissolves — motes swirling up as embers while
 *    the canvas fades — and is gone, stopped and cleared before journey 0's
 *    pre-start: the spin-up stall lands on the static text alone;
 *  • the release clears the image + fire, so journey 0 starts clean
 *    (statement-piano-card.ts — unit-tested hand-back).
 */
import { useEffect, useRef } from "react";
import { acquireSharedParticleEngine, setStatementHold, particlesDisabledReason } from "@/lib/particles/shared-engine";
import { glitchRecord } from "@/lib/journeys/glitch-recorder";
import { PARTICLES_ENABLED, particlesForcedThisSession } from "@/lib/journeys/particle-lead";
import { loadStatementPiano, cachedSamples, budgetFor } from "./particle-lead-layer";
import { TEXT_FADE_MS, LATEST_START_MS, READY_POLL_MS, HOLD_MAX_MS } from "@/lib/particles/statement-piano-plan";
import { createPianoCard } from "@/lib/particles/statement-piano-card";

const particlesActive = () => PARTICLES_ENABLED || particlesForcedThisSession();

// start decoding as soon as this module loads (the loop page) — long before any card
if (typeof window !== "undefined") void loadStatementPiano();

export function StatementPiano({ cardT0, textShown }: { cardT0: number; textShown: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !particlesActive() || particlesDisabledReason()) return;
    // the CARD's clock (the loop's pre-start timer runs on it), not this mount's
    const at = () => performance.now() - cardT0;
    const sh = acquireSharedParticleEngine(budgetFor());
    if (!sh) return;
    const { engine, canvas } = sh;
    // take the canvas while the card is black: invisible, and still
    engine.stop();
    sh.hooks.audio = null; // the card's piano listens to nothing
    canvas.style.transition = "none";
    canvas.style.opacity = "0.001";
    host.appendChild(canvas);
    void canvas.offsetWidth;
    const card = createPianoCard<HTMLCanvasElement>({
      engine,
      style: canvas.style,
      at,
      screenAspect: () => window.innerWidth / Math.max(1, window.innerHeight),
      samples: cachedSamples,
      setHold: (on) => setStatementHold(on),
      record: glitchRecord,
    });
    setStatementHold(true, HOLD_MAX_MS - at(), () => card.release("hold expired"));
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    // AT LOAD TOO: the boot card waits for the session's program warm-up (~4 s;
    // the engine must not run meanwhile) and gathers as soon as it is done, as
    // long as there is time to form and be seen before the dissolve
    const schedule = (img: HTMLCanvasElement | null) => {
      if (cancelled) return;
      if (img && !engine.isWarm() && at() < LATEST_START_MS) { timers.push(setTimeout(() => schedule(img), READY_POLL_MS)); return; }
      const ready = !!img && engine.isWarm();
      const sched = ready ? card.schedule(at()) : [{ at: 0, step: "release" as const }];
      if (!ready) glitchRecord("piano-skip", img ? "programs warming" : "no image");
      else if (sched.length === 1) glitchRecord("piano-skip", `ready too late @${Math.round(at())}ms`);
      else if (at() > 1000) glitchRecord("piano", `ready @${Math.round(at())}ms (boot warm-up)`);
      for (const ev of sched) timers.push(setTimeout(() => card.run(ev.step, img), Math.max(0, ev.at - at())));
    };
    void loadStatementPiano().then(schedule);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // operator skip / unmount mid-card: stop, clear, hand back (the card's
      // black background is still up, so nothing is seen to vanish)
      card.release("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one card, one clock
  }, []);
  return (
    <>
      <div ref={hostRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 121 }} aria-hidden />
      {/* a soft dark halo behind the title (invisible on black): the words
          stay legible over the piano without touching their design */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 121,
          background: "radial-gradient(ellipse 34vw 22vh at 50% 52%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 45%, transparent 100%)",
          // leaves with the text — never darkens the journey revealed after the card
          opacity: textShown ? 1 : 0,
          transition: `opacity ${TEXT_FADE_MS}ms ease-out`,
        }}
        aria-hidden
      />
    </>
  );
}
