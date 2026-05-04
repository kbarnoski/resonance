"use client";

import type { Journey } from "@/lib/journeys/types";

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
  | "fading-cycle"
  | "journey"
  | "fading-journey"
  | "gone";

interface Props {
  stage?: Stage;
  journey?: Journey | null;
  trackArtist?: string | null;
}

export function InstallationIntro({ stage = "cycle", journey, trackArtist }: Props) {
  // bg-black: opaque during cycle + fading-cycle, fades out during
  // journey + fading-journey on the SAME 3.8s clock as the journey
  // title's inner fade-in. This keeps the visualizer hidden until the
  // title is appearing — no orb-shader-flash window.
  const bgMounted = stage !== "gone";
  const bgOpacity =
    stage === "journey" || stage === "fading-journey" ? 0 : 1;

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
          className="absolute inset-0 z-50 pointer-events-none"
          style={{
            backgroundColor: "black",
            opacity: bgOpacity,
            // Match the journey title's inner-fade clock exactly so
            // the shader emerges in-step with the title appearing.
            transition: "opacity 3800ms ease-out",
          }}
        />
      )}

      {cycleMounted && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-8 text-center"
          style={{
            zIndex: 51,
            opacity: cycleOpacity,
            transition: "opacity 1500ms ease-out",
          }}
        >
          <CycleTextInner />
        </div>
      )}

      {journeyMounted && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center px-8 text-center"
          style={{
            zIndex: 51,
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

function CycleTextInner() {
  return (
    <div style={{ animation: "installationContentFade 1400ms ease-out forwards", opacity: 0 }}>
      <div
        className="text-white/90"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontSize: "clamp(3.5rem, 8vw, 6rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
        }}
      >
        Resonance
      </div>
      <div
        className="text-white/65 mt-4"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.3rem, 2.8vw, 2rem)",
          letterSpacing: "0.01em",
        }}
      >
        A contemplative listening room
      </div>
      <p
        className="text-white/55 mt-12 max-w-2xl mx-auto"
        style={{
          fontFamily: "var(--font-geist-sans)",
          fontWeight: 400,
          fontSize: "clamp(1.05rem, 1.8vw, 1.3rem)",
          lineHeight: 1.65,
        }}
      >
        Composed music drives a slow audiovisual landscape — shaders, light,
        AI-curated imagery — that never repeats verbatim. Recline. Stay as long
        or as briefly as you wish.
      </p>
      <div
        className="text-white/55 mt-14"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.85rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
        }}
      >
        by
      </div>
      <div
        className="text-white/85 mt-2"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)",
          letterSpacing: "0.02em",
        }}
      >
        Karel Barnoski
      </div>
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
      <div
        className="text-white/55"
        style={{
          position: "relative",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.78rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: "1.75rem",
          textShadow: TEXT_SHADOW,
        }}
      >
        Journey
      </div>
      <div
        className="text-white"
        style={{
          position: "relative",
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontSize: "clamp(3rem, 6.5vw, 5rem)",
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
          textShadow: TEXT_SHADOW,
        }}
      >
        {journey.name}
      </div>
      {journey.subtitle && (
        <div
          className="text-white/75 mt-4"
          style={{
            position: "relative",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(1.2rem, 2.4vw, 1.7rem)",
            letterSpacing: "0.01em",
            textShadow: TEXT_SHADOW,
          }}
        >
          {journey.subtitle}
        </div>
      )}
      <div
        className="text-white/65 mt-12"
        style={{
          position: "relative",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "1rem",
          letterSpacing: "0.06em",
          textShadow: TEXT_SHADOW,
        }}
      >
        {(() => {
          // Same join logic as the visualizer-client journey intro so
          // every journey in the installation loop renders identical
          // credits — Ascension (this component) and journeys 1-4
          // (visualizer-client) use a shared format.
          const parts: string[] = [`by ${creator}`];
          if (trackArtist && trackArtist !== creator) parts.push(`Music by ${trackArtist}`);
          if (journey.photographyCredit) parts.push(`Photography by ${journey.photographyCredit}`);
          return parts.join("  ·  ");
        })()}
      </div>
      {journey.dedication && (
        <div
          className="text-white/75 mt-8 max-w-2xl mx-auto"
          style={{
            position: "relative",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
            letterSpacing: "0.02em",
            lineHeight: 1.5,
            textShadow: TEXT_SHADOW,
          }}
        >
          {journey.dedication}
        </div>
      )}
    </div>
  );
}
