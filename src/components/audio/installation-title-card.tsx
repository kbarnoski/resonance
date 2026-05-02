"use client";

import type { Journey } from "@/lib/journeys/types";

interface InstallationTitleCardProps {
  journey: Journey;
  trackTitle?: string | null;
  trackArtist?: string | null;
}

/**
 * Per-journey title card — shows journey name + subtitle + credits while
 * the journey audio starts. Auto-fades after the loop client's
 * TITLE_CARD_MS window so the visuals can take over.
 */
export function InstallationTitleCard({
  journey,
  trackTitle,
  trackArtist,
}: InstallationTitleCardProps) {
  const creator = journey.creatorName ?? "Karel Barnoski";
  const musicCredit = trackArtist || creator;
  const trackLine = trackTitle
    ? `${trackTitle} · Music by ${musicCredit}`
    : `Music by ${musicCredit}`;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center px-10 text-center pointer-events-none"
      style={{
        animation: "titleCardCycle 6000ms ease-in-out forwards",
      }}
    >
      {/* Soft vignette so the card reads cleanly over any shader */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.45) 40%, transparent 75%)",
          filter: "blur(20px)",
        }}
      />

      <div className="relative">
        <div
          className="text-white/45"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.72rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: "1.25rem",
          }}
        >
          Journey
        </div>

        <h2
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
        </h2>

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
          {trackLine}
        </div>
        <div
          className="text-white/25 mt-1"
          style={{
            fontFamily: "var(--font-geist-mono)",
            fontSize: "0.72rem",
            letterSpacing: "0.05em",
          }}
        >
          by {creator}
        </div>
      </div>

      <style jsx>{`
        @keyframes titleCardCycle {
          0%   { opacity: 0; }
          12%  { opacity: 1; }
          78%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
