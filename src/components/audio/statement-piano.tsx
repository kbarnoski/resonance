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
 *  • it gathers 0.7 → ~3 s, then the engine STOPS before journey 0's
 *    pre-start: the canvas keeps its last frame — a still — through the
 *    set-start GPU stall; it fades with the text on CSS opacity only;
 *  • the journey behind the card waits for the release (shared-engine hold)
 *    and only then takes the engine back.
 */
import { useEffect, useRef } from "react";
import { acquireSharedParticleEngine, setStatementHold, particlesDisabledReason } from "@/lib/particles/shared-engine";
import { glitchRecord } from "@/lib/journeys/glitch-recorder";
import { PARTICLES_ENABLED, particlesForcedThisSession } from "@/lib/journeys/particle-lead";
import { loadStatementPiano, cachedSamples, budgetFor } from "./particle-lead-layer";
import {
  pianoSchedule, stepAllowed, pianoPlaneScale, PIANO_OPACITY, PIANO_OFFSET_Y, PIANO_FORM, TEXT_FADE_MS, LATEST_START_MS, READY_POLL_MS, type PianoStep,
} from "@/lib/particles/statement-piano-plan";

const particlesActive = () => PARTICLES_ENABLED || particlesForcedThisSession();

// start decoding as soon as this module loads (the loop page) — long before any card
if (typeof window !== "undefined") void loadStatementPiano();

export function StatementPiano({ cardT0, textShown }: { cardT0: number; textShown: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !particlesActive() || particlesDisabledReason()) return;
    // the CARD's clock (the loop's pre-start timer runs on it), not this mount's
    const t0 = cardT0;
    const at = () => performance.now() - t0;
    const sh = acquireSharedParticleEngine(budgetFor());
    if (!sh) return;
    const { engine, canvas } = sh;
    setStatementHold(true);
    // take the canvas while the card is black: invisible, and still
    engine.stop();
    sh.hooks.audio = null; // the card's piano listens to nothing — a still, warm presence
    canvas.style.transition = "none";
    canvas.style.opacity = "0.001";
    host.appendChild(canvas);
    void canvas.offsetWidth;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let released = false, started = false;
    const release = () => {
      if (released) return;
      released = true;
      engine.stop();
      canvas.style.transition = "none";
      canvas.style.opacity = "0.001";
      engine.snapImage(true); // invisible: the journey never sees the piano fade
      setStatementHold(false);
    };
    const run = (step: PianoStep, img: HTMLCanvasElement | null) => {
      const t = at();
      if (!stepAllowed(step, t)) { glitchRecord("piano-skip", `${step} @${Math.round(t)}ms (guard)`); if (step === "start" || step === "upload") release(); return; }
      if (released) return;
      if (step === "upload" && img) {
        engine.setDensity(0);
        engine.setImageVariant(false, 0);
        engine.setImageTint(0); // the photograph's own amber, gold and fire
        engine.setImageScale(pianoPlaneScale(img.width / Math.max(1, img.height), window.innerWidth / Math.max(1, window.innerHeight)));
        engine.setOffset(0, PIANO_OFFSET_Y);
        engine.setInstances(1, 0);
        engine.snapImage(); // invisible: placement lands now, never glides mid-gather
        engine.loadFormImage(img, img.width / Math.max(1, img.height), cachedSamples(img, engine.imageSampleCount()), true);
        engine.setImageForm(PIANO_FORM, 1);
      } else if (step === "start") {
        started = true;
        engine.start();
        canvas.style.transition = "opacity 1400ms ease-out";
        canvas.style.opacity = String(PIANO_OPACITY);
        glitchRecord("piano", `gather @${Math.round(t)}ms`);
      } else if (step === "stop") {
        engine.stop(); // the canvas holds the formed piano as a still frame
        glitchRecord("piano", `hold @${Math.round(t)}ms`);
      } else if (step === "fade") {
        canvas.style.transition = `opacity ${TEXT_FADE_MS}ms ease-out`;
        canvas.style.opacity = "0.001";
      } else if (step === "release") {
        release();
      }
    };
    let cancelled = false;
    // AT LOAD TOO (Karel 2026-10-09: "the resonance screen should have the
    // burning piano on it when it loads"): the boot card waits for the
    // session's program warm-up (~4 s; the engine must not run meanwhile —
    // warming builds one pipeline per step while it is stopped) and gathers
    // as soon as it is done, as long as there is time to form before the stop
    const schedule = (img: HTMLCanvasElement | null) => {
      if (cancelled) return;
      if (img && !engine.isWarm() && at() < LATEST_START_MS) { timers.push(setTimeout(() => schedule(img), READY_POLL_MS)); return; }
      const ready = !!img && engine.isWarm();
      const sched = ready ? pianoSchedule(at()) : [{ at: 0, step: "release" as const }];
      if (!ready) glitchRecord("piano-skip", img ? "programs warming" : "no image");
      else if (sched.length === 1) glitchRecord("piano-skip", `ready too late @${Math.round(at())}ms`);
      else if (at() > 1000) glitchRecord("piano", `ready @${Math.round(at())}ms (boot warm-up)`);
      for (const ev of sched) timers.push(setTimeout(() => run(ev.step, img), Math.max(0, ev.at - at())));
    };
    void loadStatementPiano().then(schedule);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      // operator skip / unmount mid-card: the field leaves on CSS, then frees the engine
      if (!released) {
        if (started) { canvas.style.transition = "opacity 600ms linear"; canvas.style.opacity = "0.001"; }
        released = true;
        engine.stop();
        setStatementHold(false);
      }
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
