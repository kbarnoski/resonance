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
 *  • it is FORMED invisibly (motes placed on the photograph on black), then
 *    fades in WITH the logo + text and out WITH them (one layer, one curve),
 *    burning (living fire, draw-only motion) while visible; text + piano are
 *    gone before journey 0's pre-start — the spin-up lands on black;
 *  • the release clears the image + fire, so journey 0 starts clean
 *    (statement-piano-card.ts — unit-tested hand-back).
 */
import { useEffect, useRef } from "react";
import { acquireSharedParticleEngine, setStatementHold, particlesDisabledReason } from "@/lib/particles/shared-engine";
import { glitchRecord } from "@/lib/journeys/glitch-recorder";
import { PARTICLES_ENABLED, particlesForcedThisSession } from "@/lib/journeys/particle-lead";
import { loadStatementPiano, cachedSamples, budgetFor } from "./particle-lead-layer";
import { REVEAL_AT_MS, LATEST_REVEAL_MS, FORM_LEAD_MS, READY_POLL_MS, HOLD_MAX_MS, PIANO_OPACITY, TEXT_FADE_MS, cardLayer, textOnlySchedule } from "@/lib/particles/statement-piano-plan";
import type { PianoCard } from "@/lib/particles/statement-piano-card";

/** a held card's engine hold: long but FINITE (setTimeout clamps anything over
 *  2^31-1 ms to ~1 ms — an "infinite" hold would expire at once) */
const TITLE_HOLD_MAX_MS = 24 * 3600 * 1000;
import { createPianoCard } from "@/lib/particles/statement-piano-card";

const particlesActive = () => PARTICLES_ENABLED || particlesForcedThisSession();

// start decoding as soon as this module loads (the loop page) — long before any card
if (typeof window !== "undefined") void loadStatementPiano();

export function StatementPiano({ cardT0, stage, revealed, onReveal, hold = false }: { cardT0: number; stage: string; revealed: boolean; onReveal: () => void; hold?: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // phone "title-hold" (Karel 2026-10-10): the piano stays formed and burning
  // until released — no release step, no hold expiry; on release it fades
  // WITH the text, then hands the engine back (below)
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const cardRef = useRef<PianoCard<HTMLCanvasElement> | null>(null);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  useEffect(() => {
    const host = hostRef.current;
    // the CARD's clock (the loop's pre-start timer runs on it), not this mount's
    const at = () => performance.now() - cardT0;
    const reveal = () => revealRef.current();
    const textOnly = () => { const id = setTimeout(reveal, Math.max(0, REVEAL_AT_MS - at())); return () => clearTimeout(id); };
    if (!host || !particlesActive() || particlesDisabledReason()) return textOnly();
    const sh = acquireSharedParticleEngine(budgetFor());
    if (!sh) return textOnly();
    const { engine, canvas } = sh;
    // take the canvas while the card is black: the host layer is at opacity 0
    // until the reveal, so the canvas itself can be fully opaque
    engine.stop();
    sh.hooks.audio = null; // the card's piano listens to nothing
    canvas.style.transition = "none";
    canvas.style.opacity = "1";
    host.appendChild(canvas);
    void canvas.offsetWidth;
    const card = createPianoCard<HTMLCanvasElement>({
      engine,
      at,
      screenAspect: () => window.innerWidth / Math.max(1, window.innerHeight),
      samples: cachedSamples,
      setHold: (on) => {
        if (!on) { canvas.style.transition = "none"; canvas.style.opacity = "0.001"; } // the journey reads "invisible"
        setStatementHold(on);
      },
      reveal,
      record: glitchRecord,
    });
    cardRef.current = card;
    setStatementHold(true, holdRef.current ? TITLE_HOLD_MAX_MS : HOLD_MAX_MS - at(), () => card.release("hold expired"));
    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    // AT LOAD TOO: the boot card waits for the session's program warm-up
    // (~3.85 s, measured; the engine must not run meanwhile) — the logo, text
    // and piano then appear together as soon as it has formed
    const schedule = (img: HTMLCanvasElement | null) => {
      if (cancelled) return;
      if (img && !engine.isWarm() && at() < LATEST_REVEAL_MS - FORM_LEAD_MS - 100) { timers.push(setTimeout(() => schedule(img), READY_POLL_MS)); return; }
      const ready = !!img && engine.isWarm();
      const sched = ready ? card.schedule(at()) : textOnlySchedule(at());
      if (!ready) glitchRecord("piano-skip", img ? "programs warming" : "no image");
      else if (at() > 1000) glitchRecord("piano", `ready @${Math.round(at())}ms (boot warm-up)`);
      for (const ev of sched) {
        // held: the scheduled release is skipped (re-checked when it would fire)
        timers.push(setTimeout(() => { if (ev.step === "release" && holdRef.current) return; card.run(ev.step, img); }, Math.max(0, ev.at - at())));
      }
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
  // released from a hold: the card's layer fades with the text (stage →
  // fading-cycle, TEXT_FADE_MS); THEN the piano hands the engine back — well
  // before the loop's pre-start (TEXT_OUT_BEFORE_PRESTART_MS after release)
  const wasHeld = useRef(hold);
  useEffect(() => {
    if (hold) { wasHeld.current = true; return; }
    if (!wasHeld.current) return;
    wasHeld.current = false;
    const card = cardRef.current;
    if (!card || card.released) return;
    setStatementHold(true, TEXT_FADE_MS + 1500, () => card.release("hold expired"));
    const id = setTimeout(() => card.release("title-release"), TEXT_FADE_MS);
    return () => clearTimeout(id);
  }, [hold]);
  // ONE layer with the logo + text: same opacity target, same curve, same frame
  const layer = cardLayer(stage, revealed);
  return (
    <>
      <div ref={hostRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 121, opacity: layer.shown ? PIANO_OPACITY : 0, transition: layer.transition }} aria-hidden />
      {/* a soft dark halo behind the title (invisible on black): the words
          stay legible over the piano without touching their design */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 121,
          background: "radial-gradient(ellipse 34vw 22vh at 50% 52%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 45%, transparent 100%)",
          opacity: layer.shown ? 1 : 0,
          transition: layer.transition,
        }}
        aria-hidden
      />
    </>
  );
}
