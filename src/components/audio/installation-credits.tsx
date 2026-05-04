"use client";

/**
 * Installation loop — credits screen.
 *
 * Same content for both kiosk loop and /demo. Layout: dedication on
 * top, special-thanks block below it, "Resonance · by Karel Barnoski"
 * tagline, then a closing "Thank you for experiencing Resonance"
 * line. The loop client schedules the return-to-intro:
 *   - kiosk loop: CREDITS_MS (16s) then loops
 *   - /demo:      10s then transitions to the start screen so the
 *                 reviewer can replay (or just leaves the tab)
 */
export function InstallationCredits() {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-8 text-center"
    >
      {/* Inner content gets the fade animation; the outer black layer
          is fully opaque from frame 1 so the shader stack underneath
          never peeks through. */}
      <div className="flex flex-col items-center" style={{ animation: "creditsContent 12000ms ease-in-out forwards", opacity: 0 }}>
      {/* Dedication */}
      <div
        className="text-white/35"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.72rem",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: "1.5rem",
        }}
      >
        In honor of
      </div>

      <div
        className="text-white/90"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
          letterSpacing: "-0.01em",
          lineHeight: 1.1,
          marginBottom: "3.5rem",
        }}
      >
        my father
      </div>

      {/* Special thanks — life partner */}
      <div
        className="text-white/30"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "1.25rem",
        }}
      >
        Special thanks to my life partner
      </div>

      <p
        className="text-white/75 max-w-xl"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.4rem, 2.4vw, 1.8rem)",
          lineHeight: 1.5,
        }}
      >
        Evelina
      </p>

      <div
        className="text-white/20 mt-20"
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.7rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        Resonance · by Karel Barnoski
      </div>

      {/* Closing thank-you. Same italic Cormorant treatment as the
          dedication so it reads as part of the same closing screen. */}
      <p
        className="text-white/65 mt-10 max-w-xl"
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          lineHeight: 1.5,
        }}
      >
        Thank you for experiencing Resonance.
      </p>
      </div>

      <style jsx>{`
        @keyframes creditsContent {
          0%   { opacity: 0; }
          7%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
