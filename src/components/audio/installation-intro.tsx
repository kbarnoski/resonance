"use client";

import type { Journey } from "@/lib/journeys/types";

/**
 * Installation loop — intro overlay.
 *
 * Has two text modes:
 *   - "cycle":   "Resonance — A contemplative listening room" branding
 *   - "journey": the first journey's title + credits (replaces the
 *                visualizer-client's normal journey intro for journey 0
 *                so the cycle handoff doesn't show two competing
 *                overlays at once)
 *
 * The outer black layer is fully opaque from frame 1 — only the inner
 * text content fades in. Swapping mode renders a different inner text
 * block under the same React key, so the inner fade animation runs
 * cleanly each time.
 */
type Mode = "cycle" | "journey";

interface Props {
  mode?: Mode;
  journey?: Journey | null;
  trackArtist?: string | null;
}

export function InstallationIntro({ mode = "cycle", journey, trackArtist }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-8 text-center">
      {mode === "cycle" ? (
        <CycleText />
      ) : (
        <JourneyText journey={journey} trackArtist={trackArtist} />
      )}

      <style jsx>{`
        @keyframes installationContentFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CycleText() {
  return (
    <div
      key="cycle"
      style={{ animation: "installationContentFade 1400ms ease-out forwards", opacity: 0 }}
    >
      <div
        className="text-white/90"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontSize: "clamp(3.5rem, 8vw, 6rem)",
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          textAlign: "center",
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
          textAlign: "center",
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
          textAlign: "center",
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
          textAlign: "center",
        }}
      >
        by Karel Barnoski
      </div>
    </div>
  );
}

function JourneyText({ journey, trackArtist }: { journey?: Journey | null; trackArtist?: string | null }) {
  if (!journey) return null;
  const creator = journey.creatorName || "Karel Barnoski";
  return (
    <div
      key={`journey-${journey.id}`}
      style={{ animation: "installationContentFade 1500ms ease-out forwards", opacity: 0 }}
    >
      <div
        className="text-white/45"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "1.5rem",
        }}
      >
        Journey
      </div>
      <div
        className="text-white/95"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          fontSize: "clamp(3rem, 6.5vw, 5rem)",
          letterSpacing: "-0.01em",
          lineHeight: 1.05,
        }}
      >
        {journey.name}
      </div>
      {journey.subtitle && (
        <div
          className="text-white/55 mt-3"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(1rem, 2vw, 1.4rem)",
            letterSpacing: "0.01em",
          }}
        >
          {journey.subtitle}
        </div>
      )}
      <div
        className="text-white/35 mt-10"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.78rem",
          letterSpacing: "0.05em",
        }}
      >
        by {creator}
        {trackArtist && trackArtist !== creator ? ` · Music by ${trackArtist}` : ""}
      </div>
      {journey.dedication && (
        <div
          className="text-white/40 mt-8 max-w-2xl mx-auto"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(0.95rem, 1.6vw, 1.15rem)",
            letterSpacing: "0.02em",
          }}
        >
          {journey.dedication}
        </div>
      )}
    </div>
  );
}
