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
        className="text-white/55 mt-3"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.1rem, 2.4vw, 1.7rem)",
          letterSpacing: "0.01em",
        }}
      >
        A contemplative listening room
      </div>
      <p
        className="text-white/40 mt-12 max-w-xl mx-auto"
        style={{
          fontFamily: "var(--font-geist-sans)",
          fontWeight: 400,
          fontSize: "clamp(0.85rem, 1.4vw, 1rem)",
          lineHeight: 1.7,
        }}
      >
        Composed music drives a slow audiovisual landscape — shaders, light,
        AI-curated imagery — that never repeats verbatim. Recline. Stay as long
        or as briefly as you wish.
      </p>
      <div
        className="text-white/25 mt-16"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        by Karel Barnoski
      </div>
    </div>
  );
}

function JourneyTextInner({ journey, trackArtist }: { journey?: Journey | null; trackArtist?: string | null }) {
  if (!journey) return null;
  const creator = journey.creatorName || "Karel Barnoski";
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
      {/* Soft radial-gradient backdrop — matches the in-journey intro
          overlay (visualizer-client). The shader behind can be bright
          or busy; without this halo the title and dedication can fight
          for legibility. blur(40px) keeps the edge soft so the backdrop
          doesn't read as a "card" — it's just a quiet darkening of the
          area behind the text. */}
      <div
        style={{
          position: "absolute",
          inset: "-40%",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, transparent 65%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />
      <div
        className="text-white/45"
        style={{
          position: "relative",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "1.5rem",
          textShadow: "0 2px 12px rgba(0,0,0,0.85)",
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
          textShadow: "0 4px 24px rgba(0,0,0,0.9)",
        }}
      >
        {journey.name}
      </div>
      {journey.subtitle && (
        <div
          className="text-white/65 mt-3"
          style={{
            position: "relative",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(1rem, 2vw, 1.4rem)",
            letterSpacing: "0.01em",
            textShadow: "0 2px 16px rgba(0,0,0,0.85)",
          }}
        >
          {journey.subtitle}
        </div>
      )}
      <div
        className="text-white/45 mt-10"
        style={{
          position: "relative",
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.78rem",
          letterSpacing: "0.05em",
          textShadow: "0 2px 12px rgba(0,0,0,0.85)",
        }}
      >
        by {creator}
        {trackArtist && trackArtist !== creator ? ` · Music by ${trackArtist}` : ""}
      </div>
      {journey.dedication && (
        <div
          className="text-white/55 mt-8 max-w-2xl mx-auto"
          style={{
            position: "relative",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)",
            letterSpacing: "0.02em",
            textShadow: "0 2px 14px rgba(0,0,0,0.85)",
          }}
        >
          {journey.dedication}
        </div>
      )}
    </div>
  );
}
