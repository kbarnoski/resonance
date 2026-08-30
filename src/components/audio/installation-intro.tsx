"use client";

import type { Journey } from "@/lib/journeys/types";
import { EXPERIENCE_INTRO } from "@/lib/journeys/installation-sequence";
import { ResonanceMark } from "@/components/branding/resonance-mark";
import { Eyebrow, DisplayTitle, MonoLabel } from "@/components/ui/typography";

/* Font readiness is gated upstream in installation-loop-client. By the
 * time this component renders any text, every Cormorant Garamond
 * variant we use (300 regular, 300 italic, 400) is loaded — no per-
 * component race, no font swap mid-display, no variable
 * black-pause-while-the-font-loads. */

/**
 * Installation loop — intro overlay.
 *
 * Three independent layers:
 *   1. Black background (full bg, controlled opacity)
 *   2. Cycle text ("Resonance — A contemplative listening room")
 *   3. Journey text (journey 0's title + credits)
 *
 * The bg-black layer holds OPAQUE during the entire visualizer-warmup
 * window (cycle text + the silent black hold afterward) and only
 * starts fading at the same moment the journey title mounts. Bg fade
 * and title inner fade run on the same 3.8s clock — they finish
 * together, so the shader emerges into view alongside the title and
 * the user never sees the visualizer alone.
 */
type Stage =
  | "cycle"
  | "experience"
  | "fading-cycle"
  | "journey"
  | "fading-journey"
  | "gone";

interface Props {
  stage?: Stage;
  journey?: Journey | null;
  trackArtist?: string | null;
  /** Program-driven italic line: "presenting {presenting}". */
  presenting?: string;
  /** Program-driven description paragraph. */
  description?: string;
}

export function InstallationIntro({ stage = "cycle", journey, trackArtist, presenting, description }: Props) {
  // bg-black: opaque during cycle + fading-cycle, fades out during
  // journey + fading-journey on the SAME 3.8s clock as the journey
  // title's inner fade-in. This keeps the visualizer hidden until the
  // title is appearing — no orb-shader-flash window.
  const bgMounted = stage !== "gone";
  const bgOpacity =
    stage === "journey" || stage === "fading-journey" ? 0 : 1;

  // Experience (Tramokyo cold open) mounted during its own stage and
  // through "cycle" so it fades OUT while the cycle card fades in —
  // both over the opaque bg, so the handoff is a soft crossfade.
  const expMounted = stage === "experience" || stage === "cycle";
  const expOpacity = stage === "experience" ? 1 : 0;

  // Cycle text mounted in cycle + fading-cycle, fades in fading-cycle.
  const cycleMounted = stage === "cycle" || stage === "fading-cycle";
  const cycleOpacity = stage === "fading-cycle" ? 0 : 1;

  // Journey text mounted in journey + fading-journey, fades-in via own
  // animation, fades out via opacity transition in fading-journey.
  const journeyMounted = stage === "journey" || stage === "fading-journey";
  const journeyOpacity = stage === "fading-journey" ? 0 : 1;

  return (
    <>
      {bgMounted && (
        <div
          className="absolute inset-0 z-[120] pointer-events-none"
          style={{
            backgroundColor: "var(--void)",
            opacity: bgOpacity,
            // Match the journey title's inner-fade clock exactly so
            // the shader emerges in-step with the title appearing.
            transition: "opacity 3800ms ease-out",
          }}
        />
      )}

      {expMounted && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-8 text-center"
          style={{
            zIndex: 122,
            opacity: expOpacity,
            transition: "opacity 1800ms ease-out",
          }}
        >
          <ExperienceTextInner />
        </div>
      )}

      {cycleMounted && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-8 text-center"
          style={{
            zIndex: 121,
            opacity: cycleOpacity,
            transition: "opacity 1500ms ease-out",
          }}
        >
          <CycleTextInner presenting={presenting} description={description} />
        </div>
      )}

      {journeyMounted && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-8 text-center"
          style={{
            zIndex: 121,
            opacity: journeyOpacity,
            transition: "opacity 1800ms ease-out",
          }}
        >
          <JourneyTextInner journey={journey} trackArtist={trackArtist} />
        </div>
      )}

      <style jsx>{`
        @keyframes installationContentFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}

export function ExperienceTextInner({ animate = true }: { animate?: boolean }) {
  // animate=false when a host (the mid-show statement interstitial)
  // drives the fade itself — the keyframes here are scoped to
  // InstallationIntro's style block and don't exist elsewhere.
  return (
    <div style={animate ? { animation: "installationContentFade 1400ms ease-out forwards", opacity: 0 } : undefined}>
      <ResonanceMark className="mx-auto mb-8 h-16 w-16 text-white/80" />
      <Eyebrow className="text-white/55">{EXPERIENCE_INTRO.eyebrow}</Eyebrow>
      <DisplayTitle
        as="h1"
        className="mt-3 text-[clamp(2.6rem,6vw,4.5rem)] tracking-[0.01em] text-white/90"
      >
        {EXPERIENCE_INTRO.title}
      </DisplayTitle>
      <p className="mx-auto mt-6 max-w-2xl text-[clamp(1rem,1.6vw,1.2rem)] leading-[1.7] text-white/70">
        {EXPERIENCE_INTRO.body}
      </p>
      <p className="mx-auto mt-4 max-w-2xl text-[clamp(0.95rem,1.5vw,1.1rem)] leading-[1.7] text-white/60">
        {EXPERIENCE_INTRO.bodySecond}
      </p>
      <DisplayTitle
        as="div"
        className="mt-8 text-[clamp(1.2rem,2.2vw,1.6rem)] tracking-[0.02em] text-white/80"
      >
        {EXPERIENCE_INTRO.invitation}
      </DisplayTitle>
      <MonoLabel className="mt-10 block text-sm tracking-[0.08em] text-white/55">
        {EXPERIENCE_INTRO.credit}
      </MonoLabel>
      <MonoLabel className="mt-2 block text-xs tracking-[0.08em] text-white/45">
        {EXPERIENCE_INTRO.thanks}
      </MonoLabel>
    </div>
  );
}

function CycleTextInner({ presenting, description }: { presenting?: string; description?: string }) {
  return (
    <div style={{ animation: "installationContentFade 1400ms ease-out forwards", opacity: 0 }}>
      {/* Resonance brand mark — same stylized branching SVG used in
          the sidebar nav. Sized to feel grand without competing with
          the typographic title underneath. */}
      <ResonanceMark
        color="rgba(255, 255, 255, 0.9)"
        strokeWidth={1.2}
        style={{
          display: "block",
          width: "clamp(72px, 8vw, 112px)",
          height: "clamp(72px, 8vw, 112px)",
          margin: "0 auto 1.5rem",
        }}
      />
      <DisplayTitle
        as="div"
        className="not-italic text-white/90 text-[clamp(3.5rem,8vw,6rem)] tracking-[-0.02em]"
      >
        Resonance
      </DisplayTitle>
      <DisplayTitle
        as="div"
        className="mt-4 text-[clamp(1.3rem,2.8vw,2rem)] tracking-[0.01em] leading-[normal] text-white/65"
      >
        presenting {presenting ?? "the Snowflake EP"}
      </DisplayTitle>
      <p
        className="text-white/55 mt-12 max-w-2xl mx-auto"
        style={{
          fontFamily: "var(--font-geist-sans)",
          fontWeight: 400,
          fontSize: "clamp(1.05rem, 1.8vw, 1.3rem)",
          lineHeight: 1.65,
        }}
      >
        {description ??
          "Snowflake, Realized, Ghost — three original improvised piano recordings, tracing an arc from stillness, through fire, into light. AI-generated visuals improvise alongside the music, never the same twice. Recline."}
      </p>
      <Eyebrow className="mt-14 text-[0.85rem] tracking-[0.22em] text-white/55">
        composed and performed by
      </Eyebrow>
      <DisplayTitle
        as="div"
        className="mt-2 text-[clamp(1.4rem,2.6vw,1.9rem)] tracking-[0.02em] leading-[normal] text-white/85"
      >
        Karel Barnoski
      </DisplayTitle>
    </div>
  );
}

function JourneyTextInner({ journey, trackArtist }: { journey?: Journey | null; trackArtist?: string | null }) {
  if (!journey) return null;
  const creator = journey.creatorName || "Karel Barnoski";
  // Common text-shadow stack for legibility against arbitrary
  // shader/AI imagery. Combines a tight inner shadow (sharpness on
  // bright backgrounds) with a wider outer one (separation against
  // medium-tone backgrounds). Used on every text element below.
  const TEXT_SHADOW =
    "0 1px 2px rgba(0,0,0,0.95), 0 2px 12px rgba(0,0,0,0.9), 0 0 32px rgba(0,0,0,0.7)";
  return (
    <div
      style={{
        animation: "installationContentFade 3800ms ease-out forwards",
        opacity: 0,
        position: "relative",
        padding: "4rem 6rem",
        maxWidth: "90vw",
      }}
    >
      {/* Soft radial-gradient backdrop — darker + larger than the
          in-journey intro overlay since installation-mode credits run
          longer and over more imagery types. blur(48px) keeps the edge
          soft so it reads as a halo, not a card. The combination of
          this backdrop + the per-text-shadow stack covers every
          lighting condition we've seen in the journey image set
          (bright cosmic frames, dark caves, busy gradients). */}
      <div
        style={{
          position: "absolute",
          inset: "-50%",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,0.15) 55%, transparent 75%)",
          filter: "blur(48px)",
          pointerEvents: "none",
        }}
      />
      <Eyebrow
        className="relative mb-7 text-[0.78rem] tracking-[0.22em] text-white/55"
        style={{ textShadow: TEXT_SHADOW }}
      >
        Journey
      </Eyebrow>
      <DisplayTitle
        as="div"
        className="relative not-italic text-white text-[clamp(3rem,6.5vw,5rem)] tracking-[-0.01em]"
        style={{ textShadow: TEXT_SHADOW }}
      >
        {journey.name}
      </DisplayTitle>
      {journey.subtitle && (
        <DisplayTitle
          as="div"
          className="relative mt-4 font-normal text-[clamp(1.2rem,2.4vw,1.7rem)] tracking-[0.01em] leading-[normal] text-white/75"
          style={{ textShadow: TEXT_SHADOW }}
        >
          {journey.subtitle}
        </DisplayTitle>
      )}
      {(() => {
        // No per-track self-credit — the program intro already says
        // "composed and performed by Karel Barnoski" once (Karel's
        // 2026-08-30 kiosk feedback: don't repeat it on every track).
        // Credits render only when someone ELSE shares the card; with
        // nothing to credit the label (and its margin) is omitted.
        const parts: string[] = [];
        if (trackArtist && trackArtist !== creator) {
          parts.push(`by ${creator}`, `Music by ${trackArtist}`);
        }
        if (journey.photographyCredit) parts.push(`Photography by ${journey.photographyCredit}`);
        if (parts.length === 0) return null;
        return (
          <MonoLabel
            className="relative mt-12 text-base tracking-[0.06em] text-white/65"
            style={{ textShadow: TEXT_SHADOW }}
          >
            {parts.join("  ·  ")}
          </MonoLabel>
        );
      })()}
      {journey.dedication && (
        <DisplayTitle
          as="div"
          className="relative mt-8 max-w-2xl mx-auto font-normal text-[clamp(1.15rem,2vw,1.45rem)] tracking-[0.02em] leading-[1.5] text-white/75"
          style={{ textShadow: TEXT_SHADOW }}
        >
          {journey.dedication}
        </DisplayTitle>
      )}
    </div>
  );
}
